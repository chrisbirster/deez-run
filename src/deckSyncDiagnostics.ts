import type { Deck } from "./appApi";
import { localDb, type LocalDeck, type OutboxItem } from "./localDb";
import { appApi as remoteApi } from "./remoteApi";

export type DeckCounts = {
  notes: number;
  cards: number;
  due: number;
};

export type DeckSyncState =
  | "synced"
  | "syncing"
  | "pending"
  | "conflict"
  | "local-only"
  | "cloud-only"
  | "offline"
  | "cloud-unavailable";

export type DeckSyncDiagnostic = {
  key: string;
  name: string;
  local_id?: string;
  cloud_id?: string;
  local: DeckCounts;
  cloud?: DeckCounts;
  pending: number;
  conflicts: number;
  state: DeckSyncState;
};

export type DeckSyncSnapshot = {
  decks: DeckSyncDiagnostic[];
  outbox: OutboxItem[];
  cloud_available: boolean;
  cloud_error?: string;
};

function deckCounts(deck: Deck): DeckCounts {
  return {
    notes: deck.note_count,
    cards: deck.card_count,
    due: deck.due_count,
  };
}

function message(reason: unknown) {
  return reason instanceof Error ? reason.message : "Cloud status is unavailable.";
}

function sameCounts(left: DeckCounts, right: DeckCounts) {
  return left.notes === right.notes && left.cards === right.cards && left.due === right.due;
}

function stateFor(local: LocalDeck | undefined, cloud: Deck | undefined, localCounts: DeckCounts, cloudCounts: DeckCounts | undefined, pending: number, conflicts: number, cloudAvailable: boolean): DeckSyncState {
  if (conflicts > 0) return "conflict";
  if (pending > 0) return "pending";
  if (!cloudAvailable) return navigator.onLine ? "cloud-unavailable" : "offline";
  if (!local && cloud) return "cloud-only";
  if (local && !cloud) return "local-only";
  if (local && cloudCounts && sameCounts(localCounts, cloudCounts)) return "synced";
  return "syncing";
}

export async function loadDeckSyncDiagnostics(): Promise<DeckSyncSnapshot> {
  const [localDecks, localNotes, localCards, outbox] = await Promise.all([
    localDb.decks(),
    localDb.notes(),
    localDb.cards(),
    localDb.outbox(),
  ]);

  let cloudDecks: Deck[] | undefined;
  let cloudError: string | undefined;
  if (navigator.onLine) {
    try {
      cloudDecks = await remoteApi.listDecks();
    } catch (reason) {
      cloudError = message(reason);
    }
  }

  const visibleDecks = localDecks.filter((deck) => !deck.deleted);
  const notesByDeck = new Map<string, number>();
  for (const note of localNotes) {
    if (note.deleted) continue;
    notesByDeck.set(note.deck_id, (notesByDeck.get(note.deck_id) ?? 0) + 1);
  }
  const cardsByDeck = new Map<string, number>();
  const dueByDeck = new Map<string, number>();
  const now = Date.now();
  for (const card of localCards) {
    cardsByDeck.set(card.deck_id, (cardsByDeck.get(card.deck_id) ?? 0) + 1);
    if (card.due_at_ms <= now) dueByDeck.set(card.deck_id, (dueByDeck.get(card.deck_id) ?? 0) + 1);
  }

  const entityDeck = new Map<string, string>();
  for (const deck of visibleDecks) entityDeck.set(deck.id, deck.id);
  for (const note of localNotes) entityDeck.set(note.id, note.deck_id);
  for (const card of localCards) entityDeck.set(card.id, card.deck_id);

  const pendingByDeck = new Map<string, number>();
  const conflictsByDeck = new Map<string, number>();
  for (const item of outbox) {
    const deckId = entityDeck.get(item.entity_id);
    if (!deckId) continue;
    pendingByDeck.set(deckId, (pendingByDeck.get(deckId) ?? 0) + 1);
    if (item.conflict) conflictsByDeck.set(deckId, (conflictsByDeck.get(deckId) ?? 0) + 1);
  }

  const cloudById = new Map((cloudDecks ?? []).map((deck) => [deck.id, deck]));
  const matchedCloudIds = new Set<string>();
  const diagnostics: DeckSyncDiagnostic[] = [];

  for (const local of visibleDecks) {
    const remoteId = local.remote_id ?? (cloudById.has(local.id) ? local.id : undefined);
    const cloud = remoteId ? cloudById.get(remoteId) : undefined;
    if (cloud) matchedCloudIds.add(cloud.id);
    const localCounts: DeckCounts = {
      notes: notesByDeck.get(local.id) ?? 0,
      cards: cardsByDeck.get(local.id) ?? 0,
      due: dueByDeck.get(local.id) ?? 0,
    };
    const cloudCounts = cloud ? deckCounts(cloud) : undefined;
    const pending = pendingByDeck.get(local.id) ?? 0;
    const conflicts = conflictsByDeck.get(local.id) ?? 0;
    diagnostics.push({
      key: local.id,
      name: local.name,
      local_id: local.id,
      cloud_id: cloud?.id,
      local: localCounts,
      cloud: cloudCounts,
      pending,
      conflicts,
      state: stateFor(local, cloud, localCounts, cloudCounts, pending, conflicts, cloudDecks !== undefined),
    });
  }

  for (const cloud of cloudDecks ?? []) {
    if (matchedCloudIds.has(cloud.id)) continue;
    const cloudCounts = deckCounts(cloud);
    diagnostics.push({
      key: `cloud:${cloud.id}`,
      name: cloud.name,
      cloud_id: cloud.id,
      local: { notes: 0, cards: 0, due: 0 },
      cloud: cloudCounts,
      pending: 0,
      conflicts: 0,
      state: "cloud-only",
    });
  }

  diagnostics.sort((left, right) => left.name.localeCompare(right.name));
  return {
    decks: diagnostics,
    outbox,
    cloud_available: cloudDecks !== undefined,
    cloud_error: cloudError,
  };
}
