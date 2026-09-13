import type { Deck } from "./appApi";
import { localDb, localId, type LocalDeck, type LocalNote, type OutboxItem } from "./localDb";
import { replicateNow, replicationStatus } from "./localReplication";
import type { PortableDeck, PortableNote } from "./portable";

export type ImportStage = "writing-local" | "uploading" | "generating" | "complete" | "attention";
export type ImportProgress = {
  stage: ImportStage;
  deckId: string;
  name: string;
  total: number;
  written: number;
  pending: number;
  rejected: number;
  cloudNotes: number;
  cloudCards: number;
};

function outbox(kind: OutboxItem["kind"], entityId: string, createdAtMs: number, payload: Record<string, unknown> = {}): OutboxItem {
  return {
    id: `${kind}:${entityId}:${createdAtMs}:${crypto.randomUUID()}`,
    kind,
    entity_id: entityId,
    created_at_ms: createdAtMs,
    payload,
  };
}

function localNote(deckId: string, note: PortableNote, timestamp: number): LocalNote {
  return {
    id: localId("note"),
    deck_id: deckId,
    note_type: note.note_type,
    fields: [...note.fields],
    tags: [...note.tags],
    created_at_ms: timestamp,
    updated_at_ms: timestamp,
    dirty: true,
    deleted: false,
  };
}

export async function importPortableDeckAtomic(
  parsed: PortableDeck,
  onProgress?: (progress: ImportProgress) => void,
): Promise<{ deck: Deck; progress: ImportProgress }> {
  const deckId = localId("deck");
  const started = Date.now();
  const deck: LocalDeck = {
    id: deckId,
    name: parsed.name,
    note_count: parsed.notes.length,
    card_count: 0,
    due_count: 0,
    dirty: true,
    deleted: false,
  };
  const rows = parsed.notes.map((note, index) => {
    const timestamp = started + index + 1;
    const record = localNote(deckId, note, timestamp);
    return { note: record, outbox: outbox("create_note", record.id, timestamp) };
  });
  const deckOutbox = outbox("create_deck", deckId, started, { name: deck.name });

  let progress: ImportProgress = {
    stage: "writing-local",
    deckId,
    name: parsed.name,
    total: parsed.notes.length,
    written: 0,
    pending: rows.length + 1,
    rejected: 0,
    cloudNotes: 0,
    cloudCards: 0,
  };
  onProgress?.(progress);

  // Deck + notes + outbox are committed in one IndexedDB transaction. Once this
  // resolves there is no destructive rollback: the browser owns a recoverable
  // copy even if the network or server rejects an individual note later.
  await localDb.putImportBatch(deck, deckOutbox, rows);
  progress = { ...progress, written: rows.length, stage: navigator.onLine ? "uploading" : "attention" };
  onProgress?.(progress);

  if (!navigator.onLine) return { deck, progress };

  try {
    await replicateNow();
  } catch {
    // Preserve the local import and report its durable queue state below.
  }

  const queued = await localDb.outbox();
  const noteIds = new Set(rows.map((row) => row.note.id));
  const relevant = queued.filter((item) => item.entity_id === deckId || noteIds.has(item.entity_id));
  const rejected = relevant.filter((item) => Boolean(item.conflict)).length;
  const pending = relevant.length;
  const localAfter = await localDb.deck(deckId);
  const remoteId = localAfter?.remote_id;
  let cloudNotes = 0;
  let cloudCards = 0;

  if (remoteId) {
    const { appApi: remoteApi } = await import("./remoteApi");
    try {
      const cloud = await remoteApi.getDeck(remoteId);
      cloudNotes = cloud.note_count;
      cloudCards = cloud.card_count;
    } catch {
      // The local copy/outbox remains the recovery source.
    }
  }

  progress = {
    ...progress,
    stage: pending || rejected ? "attention" : "generating",
    pending,
    rejected,
    cloudNotes,
    cloudCards,
  };
  onProgress?.(progress);

  if (!pending && !rejected) {
    progress = { ...progress, stage: "complete" };
    onProgress?.(progress);
  }

  const status = await replicationStatus();
  if (status.conflicts > rejected) progress = { ...progress, stage: "attention" };
  return { deck: localAfter ?? deck, progress };
}
