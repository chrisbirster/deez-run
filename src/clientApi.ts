import {
  ApiError,
  appApi as remoteApi,
  type AuthConsume,
  type Capabilities,
  type CardDetail,
  type CardSummary,
  type Deck,
  type Note,
  type NoteInput,
  type NoteSummary,
  type Stats,
  type StudyNext,
  type StudyNextOptions,
  type StudyPreview,
  type User,
} from "./appApi";
import { localDb, localId, type LocalCard, type LocalDeck, type LocalNote, type OutboxItem, type OutboxKind } from "./localDb";
import { replicateNow } from "./replication";

let primed = false;
let primePromise: Promise<void> | undefined;

function outbox(kind: OutboxKind, entityId: string, payload: Record<string, unknown> = {}): OutboxItem {
  const now = Date.now();
  return {
    id: `${kind}:${entityId}:${now}:${crypto.randomUUID()}`,
    kind,
    entity_id: entityId,
    created_at_ms: now,
    payload,
  };
}

async function prime() {
  if (primed) return;
  if (!primePromise) {
    primePromise = (async () => {
      if (navigator.onLine) {
        try {
          await replicateNow();
        } catch (reason) {
          if (reason instanceof ApiError && reason.status === 401) throw reason;
          const local = await localDb.decks();
          if (!local.length) throw reason;
        }
      }
      primed = true;
    })().finally(() => { primePromise = undefined; });
  }
  await primePromise;
}

async function kickReplication() {
  if (!navigator.onLine) return;
  try { await replicateNow(); } catch { /* local commit remains durable and will retry */ }
}

function publicDeck(deck: LocalDeck): Deck {
  return { id: deck.id, name: deck.name, note_count: deck.note_count, card_count: deck.card_count, due_count: deck.due_count };
}

function publicNote(note: LocalNote): Note {
  return {
    id: note.id,
    deck_id: note.deck_id,
    note_type: note.note_type,
    fields: [...note.fields],
    tags: [...note.tags],
    created_at_ms: note.created_at_ms,
    updated_at_ms: note.updated_at_ms,
  };
}

async function findCards(deckId: string) {
  return (await localDb.cards()).filter((card) => card.deck_id === deckId);
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

async function cachedUser() {
  return localDb.meta<User>("user");
}

export const appApi = {
  requestMagicLink: remoteApi.requestMagicLink,

  async consumeMagicLink(token: string): Promise<AuthConsume> {
    const result = await remoteApi.consumeMagicLink(token);
    await localDb.putMeta("user", result.user);
    primed = false;
    return result;
  },

  async me(): Promise<User> {
    if (navigator.onLine) {
      try {
        const user = await remoteApi.me();
        await localDb.putMeta("user", user);
        return user;
      } catch (reason) {
        if (reason instanceof ApiError && reason.status === 401) throw reason;
        const cached = await cachedUser();
        if (cached) return cached;
        throw reason;
      }
    }
    const cached = await cachedUser();
    if (!cached) throw new Error("Open Deez online once on this device before using it offline.");
    return cached;
  },

  async setUsername(username: string) {
    const user = await remoteApi.setUsername(username);
    await localDb.putMeta("user", user);
    return user;
  },

  async logout() {
    try { if (navigator.onLine) await remoteApi.logout(); }
    finally { await localDb.resetAccountData(); primed = false; }
  },

  async logoutAll() {
    try { if (navigator.onLine) await remoteApi.logoutAll(); }
    finally { await localDb.resetAccountData(); primed = false; }
  },

  async capabilities(): Promise<Capabilities> {
    if (navigator.onLine) {
      try {
        const value = await remoteApi.capabilities();
        await localDb.putMeta("capabilities", value);
        return value;
      } catch {
        // Fall through to the cached schema.
      }
    }
    const cached = await localDb.meta<Capabilities>("capabilities");
    if (!cached) throw new Error("Note-type definitions are not cached yet. Open Deez online once before authoring offline.");
    return cached;
  },

  async stats(deckId?: string): Promise<Stats> {
    await prime();
    const decks = (await localDb.decks()).filter((deck) => !deck.deleted && (!deckId || deck.id === deckId));
    const deckIds = new Set(decks.map((deck) => deck.id));
    const cards = (await localDb.cards()).filter((card) => deckIds.has(card.deck_id));
    const now = Date.now();
    return {
      decks: decks.length,
      cards: cards.length,
      due: cards.filter((card) => !card.pending_review && card.due_at_ms <= now).length,
      reviews: cards.reduce((sum, card) => sum + card.detail.review_count, 0),
    };
  },

  async listDecks(): Promise<Deck[]> {
    await prime();
    return (await localDb.decks()).filter((deck) => !deck.deleted).map(publicDeck);
  },

  async createDeck(name: string): Promise<Deck> {
    await prime();
    const id = localId("deck");
    const deck: LocalDeck = { id, name: name.trim(), note_count: 0, card_count: 0, due_count: 0, dirty: true, deleted: false };
    await localDb.putDeckWithOutbox(deck, outbox("create_deck", id, { name: deck.name }));
    void kickReplication();
    return publicDeck(deck);
  },

  async getDeck(id: string): Promise<Deck> {
    await prime();
    const deck = await localDb.deck(id);
    if (!deck || deck.deleted) throw new Error("Deck not found");
    return publicDeck(deck);
  },

  async renameDeck(id: string, name: string): Promise<Deck> {
    await prime();
    const deck = await localDb.deck(id);
    if (!deck || deck.deleted) throw new Error("Deck not found");
    const updated: LocalDeck = { ...deck, name: name.trim(), dirty: true };
    await localDb.putDeckWithOutbox(updated, outbox("rename_deck", id, { name: updated.name }));
    void kickReplication();
    return publicDeck(updated);
  },

  async deleteDeck(id: string) {
    await prime();
    const deck = await localDb.deck(id);
    if (!deck) return;
    await localDb.putDeckWithOutbox({ ...deck, dirty: true, deleted: true }, outbox("delete_deck", id));
    void kickReplication();
  },

  async listNotes(deckId: string): Promise<NoteSummary[]> {
    await prime();
    const notes = (await localDb.notes()).filter((note) => note.deck_id === deckId && !note.deleted);
    const cards = await findCards(deckId);
    return notes.map((note) => ({
      id: note.id,
      deck_id: deckId,
      note_type: note.note_type,
      preview: note.fields[0] ?? "",
      card_count: cards.filter((card) => card.note_id === note.id).length,
      updated_at_ms: note.updated_at_ms,
    }));
  },

  async listCards(deckId: string): Promise<CardSummary[]> {
    await prime();
    return (await findCards(deckId)).map((card) => ({ ...card.summary, id: card.id, deck_id: deckId, note_id: card.note_id }));
  },

  async getNote(noteId: string): Promise<Note> {
    await prime();
    const note = await localDb.note(noteId);
    if (!note || note.deleted) throw new Error("Note not found");
    return publicNote(note);
  },

  async createNote(deckId: string, input: NoteInput): Promise<Note> {
    await prime();
    const deck = await localDb.deck(deckId);
    if (!deck || deck.deleted) throw new Error("Deck not found");
    const now = Date.now();
    const id = localId("note");
    const note: LocalNote = {
      id,
      deck_id: deckId,
      note_type: input.note_type,
      fields: [...input.fields],
      tags: [...input.tags],
      created_at_ms: now,
      updated_at_ms: now,
      dirty: true,
      deleted: false,
    };
    await localDb.putNoteWithOutbox(note, outbox("create_note", id));
    await localDb.putDeck({ ...deck, note_count: deck.note_count + 1, dirty: deck.dirty });
    void kickReplication();
    return publicNote(note);
  },

  async updateNote(noteId: string, input: NoteInput): Promise<Note> {
    await prime();
    const note = await localDb.note(noteId);
    if (!note || note.deleted) throw new Error("Note not found");
    const updated: LocalNote = {
      ...note,
      note_type: input.note_type,
      fields: [...input.fields],
      tags: [...input.tags],
      updated_at_ms: Date.now(),
      dirty: true,
    };
    await localDb.putNoteWithOutbox(updated, outbox("update_note", noteId));
    void kickReplication();
    return publicNote(updated);
  },

  async deleteNote(noteId: string) {
    await prime();
    const note = await localDb.note(noteId);
    if (!note) return;
    await localDb.putNoteWithOutbox({ ...note, deleted: true, dirty: true, updated_at_ms: Date.now() }, outbox("delete_note", noteId));
    const deck = await localDb.deck(note.deck_id);
    if (deck) await localDb.putDeck({ ...deck, note_count: Math.max(0, deck.note_count - 1) });
    void kickReplication();
  },

  async nextStudyCard(deckId: string, options: StudyNextOptions = {}): Promise<StudyNext> {
    await prime();
    const now = Date.now();
    const newSeen = options.newSeen ?? 0;
    const newLimit = options.newLimit;
    const due = (await findCards(deckId)).filter((card) => {
      if (card.pending_review || card.due_at_ms > now) return false;
      const isNew = card.summary.due_at_ms == null;
      return !isNew || newLimit === undefined || newSeen < newLimit;
    });
    const selected = orderedCards(due, options)[0];
    return { card: selected ? { id: selected.id, deck_id: deckId, due_at_ms: selected.summary.due_at_ms ?? null } : null };
  },

  async getCard(cardId: string): Promise<CardDetail> {
    await prime();
    const card = await localDb.card(cardId);
    if (!card) throw new Error("Card not found");
    return { ...card.detail, id: card.id, deck_id: card.deck_id, note_id: card.note_id };
  },

  async previewStudy(cardId: string): Promise<StudyPreview> {
    await prime();
    const card = await localDb.card(cardId);
    if (!card) throw new Error("Card not found");
    return { ...card.preview, card_id: card.id };
  },

  async review(cardId: string, rating: 1 | 2 | 3 | 4, expectedReviewCount: number, reviewedAtMs = Date.now()) {
    await prime();
    const card = await localDb.card(cardId);
    if (!card) throw new Error("Card not found");
    if (card.pending_review) throw new Error("This card already has a local review waiting to sync.");
    const key = ({ 1: "again", 2: "hard", 3: "good", 4: "easy" } as const)[rating];
    const candidate = card.preview.schedule[key];
    const reviews = [...(card.detail.reviews ?? []), { rating, reviewed_at_ms: reviewedAtMs }];
    const updated: LocalCard = {
      ...card,
      summary: { ...card.summary, due_at_ms: candidate.due_at_ms, last_reviewed_at_ms: reviewedAtMs },
      detail: {
        ...card.detail,
        review_count: expectedReviewCount + 1,
        reviews,
        scheduler: card.detail.scheduler ? { ...card.detail.scheduler, due_at_ms: candidate.due_at_ms, last_reviewed_at_ms: reviewedAtMs } : card.detail.scheduler,
      },
      due_at_ms: candidate.due_at_ms,
      pending_review: true,
    };
    await localDb.putCardWithOutbox(updated, outbox("review", cardId, {
      remote_card_id: card.remote_id,
      rating,
      expected_review_count: expectedReviewCount,
      reviewed_at_ms: reviewedAtMs,
    }));
    void kickReplication();
    return undefined;
  },
};
