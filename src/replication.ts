import { ApiError, appApi as remoteApi, type CardDetail, type Deck, type Note, type User } from "./appApi";
import { localDb, type LocalCard, type LocalDeck, type LocalNote, type OutboxItem } from "./localDb";

export type ReplicationStatus = {
  online: boolean;
  pending: number;
  conflicts: number;
  last_sync_at_ms?: number;
  account_id?: string;
};

let active: Promise<ReplicationStatus> | undefined;

function sameNote(local: LocalNote, remote: Note) {
  return local.note_type === remote.note_type
    && JSON.stringify(local.fields) === JSON.stringify(remote.fields)
    && JSON.stringify(local.tags) === JSON.stringify(remote.tags);
}

async function markConflict(item: OutboxItem, text: string) {
  await localDb.putOutbox({ ...item, conflict: text });
}

async function remoteDeckId(localId: string) {
  return (await localDb.deck(localId))?.remote_id;
}

async function remoteNoteId(localId: string) {
  return (await localDb.note(localId))?.remote_id;
}

async function flushCreateDeck(item: OutboxItem) {
  const deck = await localDb.deck(item.entity_id);
  if (!deck || deck.deleted) {
    await localDb.deleteOutbox(item.id);
    return;
  }
  if (deck.remote_id) {
    await localDb.deleteOutbox(item.id);
    return;
  }
  const remote = await remoteApi.createDeck(deck.name);
  await localDb.putDeck({
    ...deck,
    remote_id: remote.id,
    note_count: remote.note_count,
    card_count: remote.card_count,
    due_count: remote.due_count,
    base_remote_name: remote.name,
    dirty: false,
  });
  await localDb.deleteOutbox(item.id);
}

async function flushRenameDeck(item: OutboxItem) {
  const deck = await localDb.deck(item.entity_id);
  if (!deck || deck.deleted) {
    await localDb.deleteOutbox(item.id);
    return;
  }
  const remoteId = deck.remote_id;
  if (!remoteId) return;
  const remote = await remoteApi.getDeck(remoteId);
  if (deck.base_remote_name !== undefined && remote.name !== deck.base_remote_name && remote.name !== deck.name) {
    await markConflict(item, `Deck changed remotely from ${deck.base_remote_name} to ${remote.name}.`);
    return;
  }
  const updated = await remoteApi.renameDeck(remoteId, deck.name);
  await localDb.putDeck({ ...deck, base_remote_name: updated.name, dirty: false });
  await localDb.deleteOutbox(item.id);
}

async function flushDeleteDeck(item: OutboxItem) {
  const deck = await localDb.deck(item.entity_id);
  if (!deck) {
    await localDb.deleteOutbox(item.id);
    return;
  }
  if (!deck.remote_id) {
    await localDb.deleteDeckRecord(deck.id);
    await localDb.deleteOutbox(item.id);
    return;
  }
  try {
    const remote = await remoteApi.getDeck(deck.remote_id);
    if (deck.base_remote_name !== undefined && remote.name !== deck.base_remote_name) {
      await markConflict(item, `Deck was edited remotely before this deletion (${remote.name}).`);
      return;
    }
    await remoteApi.deleteDeck(deck.remote_id);
  } catch (reason) {
    if (!(reason instanceof ApiError && reason.status === 404)) throw reason;
  }
  const notes = (await localDb.notes()).filter((note) => note.deck_id === deck.id);
  const cards = (await localDb.cards()).filter((card) => card.deck_id === deck.id);
  for (const note of notes) await localDb.deleteNoteRecord(note.id);
  for (const card of cards) await localDb.deleteCardRecord(card.id);
  await localDb.deleteDeckRecord(deck.id);
  await localDb.deleteOutbox(item.id);
}

async function flushCreateNote(item: OutboxItem) {
  const note = await localDb.note(item.entity_id);
  if (!note || note.deleted) {
    await localDb.deleteOutbox(item.id);
    return;
  }
  if (note.remote_id) {
    await localDb.deleteOutbox(item.id);
    return;
  }
  const deckRemoteId = await remoteDeckId(note.deck_id);
  if (!deckRemoteId) return;
  const remote = await remoteApi.createNote(deckRemoteId, {
    note_type: note.note_type,
    fields: note.fields,
    tags: note.tags,
  });
  await localDb.putNote({
    ...note,
    remote_id: remote.id,
    remote_deck_id: remote.deck_id,
    created_at_ms: remote.created_at_ms,
    updated_at_ms: remote.updated_at_ms,
    base_remote_updated_at_ms: remote.updated_at_ms,
    dirty: false,
  });
  await localDb.deleteOutbox(item.id);
}

async function flushUpdateNote(item: OutboxItem) {
  const note = await localDb.note(item.entity_id);
  if (!note || note.deleted) {
    await localDb.deleteOutbox(item.id);
    return;
  }
  const remoteId = note.remote_id;
  if (!remoteId) return;
  const remote = await remoteApi.getNote(remoteId);
  if (note.base_remote_updated_at_ms !== undefined
      && remote.updated_at_ms !== note.base_remote_updated_at_ms
      && !sameNote(note, remote)) {
    await markConflict(item, "Note was edited on another device. Resolve that edit before this local change is pushed.");
    return;
  }
  const updated = await remoteApi.updateNote(remoteId, {
    note_type: note.note_type,
    fields: note.fields,
    tags: note.tags,
  });
  await localDb.putNote({ ...note, updated_at_ms: updated.updated_at_ms, base_remote_updated_at_ms: updated.updated_at_ms, dirty: false });
  await localDb.deleteOutbox(item.id);
}

async function flushDeleteNote(item: OutboxItem) {
  const note = await localDb.note(item.entity_id);
  if (!note) {
    await localDb.deleteOutbox(item.id);
    return;
  }
  if (!note.remote_id) {
    await localDb.deleteNoteRecord(note.id);
    await localDb.deleteOutbox(item.id);
    return;
  }
  try {
    const remote = await remoteApi.getNote(note.remote_id);
    if (note.base_remote_updated_at_ms !== undefined && remote.updated_at_ms !== note.base_remote_updated_at_ms) {
      await markConflict(item, "Note was edited remotely before this deletion.");
      return;
    }
    await remoteApi.deleteNote(note.remote_id);
  } catch (reason) {
    if (!(reason instanceof ApiError && reason.status === 404)) throw reason;
  }
  const cards = (await localDb.cards()).filter((card) => card.note_id === note.id);
  for (const card of cards) await localDb.deleteCardRecord(card.id);
  await localDb.deleteNoteRecord(note.id);
  await localDb.deleteOutbox(item.id);
}

async function flushReview(item: OutboxItem) {
  const card = await localDb.card(item.entity_id);
  const remoteCardId = card?.remote_id ?? String(item.payload.remote_card_id ?? "");
  if (!remoteCardId) return;
  const rating = Number(item.payload.rating) as 1 | 2 | 3 | 4;
  const reviewedAtMs = Number(item.payload.reviewed_at_ms);
  const expectedReviewCount = Number(item.payload.expected_review_count);
  try {
    await remoteApi.review(remoteCardId, rating, expectedReviewCount, reviewedAtMs);
  } catch (reason) {
    if (!(reason instanceof ApiError && reason.status === 409)) throw reason;
    const remote = await remoteApi.getCard(remoteCardId);
    const existing = remote.reviews?.[expectedReviewCount];
    if (!existing || existing.rating !== rating || existing.reviewed_at_ms !== reviewedAtMs) {
      await markConflict(item, "Review history diverged on another device; this review was not discarded.");
      return;
    }
  }
  if (card) await localDb.putCard({ ...card, pending_review: false });
  await localDb.deleteOutbox(item.id);
}

async function flushOutbox() {
  const items = await localDb.outbox();
  for (const item of items) {
    if (item.conflict) continue;
    if (!navigator.onLine) break;
    switch (item.kind) {
      case "create_deck": await flushCreateDeck(item); break;
      case "rename_deck": await flushRenameDeck(item); break;
      case "delete_deck": await flushDeleteDeck(item); break;
      case "create_note": await flushCreateNote(item); break;
      case "update_note": await flushUpdateNote(item); break;
      case "delete_note": await flushDeleteNote(item); break;
      case "review": await flushReview(item); break;
    }
  }
}

function cleanDeck(remote: Deck, existing?: LocalDeck): LocalDeck {
  return {
    ...remote,
    id: existing?.id ?? remote.id,
    remote_id: remote.id,
    dirty: false,
    deleted: false,
    base_remote_name: remote.name,
  };
}

function cleanNote(remote: Note, localDeckId: string, existing?: LocalNote): LocalNote {
  return {
    ...remote,
    id: existing?.id ?? remote.id,
    deck_id: localDeckId,
    remote_id: remote.id,
    remote_deck_id: remote.deck_id,
    dirty: false,
    deleted: false,
    base_remote_updated_at_ms: remote.updated_at_ms,
  };
}

async function pullSnapshot() {
  const pending = await localDb.outbox();
  const dirtyEntities = new Set(pending.map((item) => item.entity_id));
  const remoteDecks = await remoteApi.listDecks();
  const localDecks = await localDb.decks();
  const byRemoteDeck = new Map(localDecks.filter((deck) => deck.remote_id).map((deck) => [deck.remote_id!, deck]));
  const seenRemoteDecks = new Set<string>();

  for (const remoteDeck of remoteDecks) {
    seenRemoteDecks.add(remoteDeck.id);
    const existingDeck = byRemoteDeck.get(remoteDeck.id);
    if (!existingDeck || !dirtyEntities.has(existingDeck.id)) await localDb.putDeck(cleanDeck(remoteDeck, existingDeck));
    const localDeck = existingDeck ?? cleanDeck(remoteDeck);

    const remoteNoteSummaries = await remoteApi.listNotes(remoteDeck.id);
    const remoteCards = await remoteApi.listCards(remoteDeck.id);
    const localNotes = (await localDb.notes()).filter((note) => note.deck_id === localDeck.id);
    const byRemoteNote = new Map(localNotes.filter((note) => note.remote_id).map((note) => [note.remote_id!, note]));
    const seenRemoteNotes = new Set<string>();

    for (const summary of remoteNoteSummaries) {
      const remoteNote = await remoteApi.getNote(summary.id);
      seenRemoteNotes.add(remoteNote.id);
      const existingNote = byRemoteNote.get(remoteNote.id);
      if (!existingNote || !dirtyEntities.has(existingNote.id)) await localDb.putNote(cleanNote(remoteNote, localDeck.id, existingNote));
    }

    for (const localNote of localNotes) {
      if (!localNote.remote_id || seenRemoteNotes.has(localNote.remote_id) || dirtyEntities.has(localNote.id)) continue;
      await localDb.deleteNoteRecord(localNote.id);
    }

    const currentCards = (await localDb.cards()).filter((card) => card.deck_id === localDeck.id);
    const byRemoteCard = new Map(currentCards.filter((card) => card.remote_id).map((card) => [card.remote_id!, card]));
    const seenRemoteCards = new Set<string>();
    const refreshedNotes = (await localDb.notes()).filter((note) => note.deck_id === localDeck.id);
    const noteByRemote = new Map(refreshedNotes.filter((note) => note.remote_id).map((note) => [note.remote_id!, note]));

    for (const summary of remoteCards) {
      const [detail, preview] = await Promise.all([remoteApi.getCard(summary.id), remoteApi.previewStudy(summary.id)]);
      const existing = byRemoteCard.get(summary.id);
      seenRemoteCards.add(summary.id);
      const localNoteId = detail.note_id ? noteByRemote.get(detail.note_id)?.id : undefined;
      const record: LocalCard = {
        id: existing?.id ?? summary.id,
        remote_id: summary.id,
        deck_id: localDeck.id,
        note_id: localNoteId,
        summary: { ...summary, deck_id: localDeck.id, note_id: localNoteId },
        detail: { ...detail, deck_id: localDeck.id, note_id: localNoteId },
        preview,
        due_at_ms: summary.due_at_ms ?? 0,
        pending_review: existing?.pending_review ?? false,
      };
      await localDb.putCard(record);
    }

    for (const localCard of currentCards) {
      if (!localCard.remote_id || seenRemoteCards.has(localCard.remote_id) || dirtyEntities.has(localCard.id)) continue;
      await localDb.deleteCardRecord(localCard.id);
    }
  }

  for (const localDeck of localDecks) {
    if (!localDeck.remote_id || seenRemoteDecks.has(localDeck.remote_id) || dirtyEntities.has(localDeck.id)) continue;
    const notes = (await localDb.notes()).filter((note) => note.deck_id === localDeck.id);
    const cards = (await localDb.cards()).filter((card) => card.deck_id === localDeck.id);
    for (const note of notes) await localDb.deleteNoteRecord(note.id);
    for (const card of cards) await localDb.deleteCardRecord(card.id);
    await localDb.deleteDeckRecord(localDeck.id);
  }
}

async function ensureAccount(user: User) {
  const account = `${location.origin}:${user.id}`;
  const previous = await localDb.meta<string>("account");
  if (previous && previous !== account) {
    const pending = await localDb.outbox();
    if (pending.length) throw new Error("This browser has unsynced Deez changes for another account. Sign back into that account and sync before switching.");
    await localDb.resetAccountData();
  }
  await localDb.putMeta("account", account);
  return account;
}

async function runReplication(): Promise<ReplicationStatus> {
  if (!navigator.onLine) return replicationStatus();
  const user = await remoteApi.me();
  const account = await ensureAccount(user);
  await flushOutbox();
  await pullSnapshot();
  const now = Date.now();
  await localDb.putMeta("last_sync_at_ms", now);
  const status = await replicationStatus();
  return { ...status, account_id: account };
}

export function replicateNow() {
  if (!active) active = runReplication().finally(() => { active = undefined; });
  return active;
}

export async function replicationStatus(): Promise<ReplicationStatus> {
  const outbox = await localDb.outbox();
  return {
    online: navigator.onLine,
    pending: outbox.length,
    conflicts: outbox.filter((item) => Boolean(item.conflict)).length,
    last_sync_at_ms: await localDb.meta<number>("last_sync_at_ms"),
    account_id: await localDb.meta<string>("account"),
  };
}

export async function startReplication() {
  if (navigator.onLine) await replicateNow();
}
