export * from "./remoteApi";

import { appApi as accountApi } from "./accountClientApi";
import { localDb, type LocalCard } from "./localDb";
import { hydrateDeckForOffline, type OfflineSyncProgress } from "./localReplication";
import { appApi as remoteApi, type DeckSnapshot, type StudyNext, type StudyNextOptions } from "./remoteApi";

export type StudySessionOptions = StudyNextOptions & {
  excludeCardIds?: string[];
};

function changed(deckId?: string) {
  window.dispatchEvent(new CustomEvent("deez:cloud-changed", { detail: { deckId } }));
}

async function remoteDeckId(deckId: string) {
  return (await localDb.deck(deckId))?.remote_id ?? deckId;
}

async function remoteCardId(cardId: string) {
  return (await localDb.card(cardId))?.remote_id ?? cardId;
}

function hashSeed(seed: number, text: string) {
  let state = (seed >>> 0) || 0x9e3779b9;
  for (let index = 0; index < text.length; index += 1) state = Math.imul(state ^ text.charCodeAt(index), 2654435761) >>> 0;
  state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
  return state >>> 0;
}

function orderedCards(cards: LocalCard[], options: StudyNextOptions) {
  const order = options.order ?? "due";
  const copy = [...cards];
  copy.sort((left, right) => {
    const leftNew = left.summary.due_at_ms == null;
    const rightNew = right.summary.due_at_ms == null;
    if (order === "reviews-first" && leftNew !== rightNew) return leftNew ? 1 : -1;
    if (order === "new-first" && leftNew !== rightNew) return leftNew ? -1 : 1;
    const due = left.due_at_ms - right.due_at_ms;
    if (due) return due;
    if (options.shuffleSeed !== undefined) return hashSeed(options.shuffleSeed, left.id) - hashSeed(options.shuffleSeed, right.id);
    return left.id.localeCompare(right.id);
  });
  return copy;
}

async function offlineStudyNext(deckId: string, options: StudyNextOptions, excluded: Set<string>): Promise<StudyNext> {
  const now = Date.now();
  const newSeen = options.newSeen ?? 0;
  const newLimit = options.newLimit;
  const due = (await localDb.cards()).filter((card) => {
    if (card.deck_id !== deckId || excluded.has(card.id) || card.due_at_ms > now) return false;
    const isNew = card.summary.due_at_ms == null;
    return !isNew || newLimit === undefined || newSeen < newLimit;
  });
  const selected = orderedCards(due, options)[0];
  return { card: selected ? { id: selected.id, deck_id: deckId, due_at_ms: selected.summary.due_at_ms ?? null } : null };
}

async function remoteStudyNextWithExclusions(deckId: string, options: StudyNextOptions, excludedIds: string[]): Promise<StudyNext> {
  const query = new URLSearchParams();
  if (options.newLimit !== undefined) query.set("new_limit", String(options.newLimit));
  if (options.newSeen !== undefined) query.set("new_seen", String(options.newSeen));
  if (options.order) query.set("order", options.order);
  if (options.shuffleSeed !== undefined) query.set("shuffle_seed", String(options.shuffleSeed));
  if (excludedIds.length) query.set("exclude_card_ids", excludedIds.join(","));
  const response = await fetch(`/api/v1/decks/${encodeURIComponent(deckId)}/study/next?${query.toString()}`, {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    let reason = `${response.status} ${response.statusText}`;
    try {
      const body = await response.json() as { error?: { message?: string } };
      if (body.error?.message) reason = body.error.message;
    } catch { /* non-JSON fallback */ }
    throw new Error(reason);
  }
  return await response.json() as StudyNext;
}

async function mapCloudStudyNext(next: StudyNext, localDeckId: string): Promise<StudyNext> {
  if (!next.card) return next;
  const local = (await localDb.cards()).find((card) => card.remote_id === next.card!.id);
  return {
    card: {
      ...next.card,
      id: local?.id ?? next.card.id,
      deck_id: localDeckId,
    },
  };
}

export const appApi = {
  ...accountApi,

  async nextStudyCard(deckId: string, options: StudySessionOptions = {}): Promise<StudyNext> {
    const { excludeCardIds = [], ...base } = options;
    const first = await accountApi.nextStudyCard(deckId, base);
    if (!first.card || !excludeCardIds.includes(first.card.id)) return first;

    const excluded = new Set(excludeCardIds);
    const pending = await localDb.outbox();
    if (!navigator.onLine || pending.length > 0) return offlineStudyNext(deckId, base, excluded);

    const remoteExcluded = await Promise.all(excludeCardIds.map(remoteCardId));
    const next = await remoteStudyNextWithExclusions(await remoteDeckId(deckId), base, remoteExcluded);
    return mapCloudStudyNext(next, deckId);
  },

  async snapshotDeck(deckId: string): Promise<DeckSnapshot> {
    if (!navigator.onLine) {
      const deck = await accountApi.getDeck(deckId);
      const notes = await Promise.all((await accountApi.listNotes(deckId)).map((note) => accountApi.getNote(note.id)));
      const cards = await accountApi.listCards(deckId);
      return { deck, notes, cards };
    }
    return remoteApi.snapshotDeck(await remoteDeckId(deckId));
  },

  async review(cardId: string, rating: 1 | 2 | 3 | 4, expectedReviewCount: number, reviewedAtMs?: number) {
    await accountApi.review(cardId, rating, expectedReviewCount, reviewedAtMs);
    const local = await localDb.card(cardId);
    changed(local?.deck_id);
  },

  async undoLastReview(cardId: string) {
    if (!navigator.onLine) throw new Error("Undo review requires a connection so every device keeps the same immutable history.");
    const local = await localDb.card(cardId);
    await remoteApi.undoLastReview(await remoteCardId(cardId));
    changed(local?.deck_id);
  },

  async resetDeckScheduling(deckId: string) {
    if (!navigator.onLine) throw new Error("Reset scheduling requires a connection.");
    const result = await remoteApi.resetDeckScheduling(await remoteDeckId(deckId));
    changed(deckId);
    return { ...result, id: deckId };
  },

  async syncDeckForOffline(deckId: string, onProgress?: (progress: OfflineSyncProgress) => void) {
    await hydrateDeckForOffline(deckId, onProgress);
    changed(deckId);
  },
};
