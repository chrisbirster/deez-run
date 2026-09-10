import {
  ApiError,
  appApi as remoteApi,
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
} from "./remoteApi";
import { appApi as localApi } from "./localClientApi";
import { localDb, type LocalCard, type LocalDeck, type LocalNote } from "./localDb";

function publicDeck(deck: LocalDeck): Deck {
  return {
    id: deck.id,
    name: deck.name,
    note_count: deck.note_count,
    card_count: deck.card_count,
    due_count: deck.due_count,
  };
}

function shouldFallback(reason: unknown) {
  return !(reason instanceof ApiError && reason.status === 401);
}

async function remoteDeckId(deckId: string) {
  const local = await localDb.deck(deckId);
  return local?.remote_id ?? deckId;
}

async function mappedCloudDecks(): Promise<Deck[]> {
  const [cloud, local] = await Promise.all([
    remoteApi.listDecks(),
    localDb.decks(),
  ]);
  const visibleLocal = local.filter((deck) => !deck.deleted);
  const byRemote = new Map<string, LocalDeck>();
  for (const deck of visibleLocal) {
    if (deck.remote_id) byRemote.set(deck.remote_id, deck);
    if (!deck.remote_id) byRemote.set(deck.id, deck);
  }

  const matchedLocal = new Set<string>();
  const result = cloud.map((deck) => {
    const mirror = byRemote.get(deck.id);
    if (mirror) matchedLocal.add(mirror.id);
    return mirror ? { ...deck, id: mirror.id } : deck;
  });

  // Never hide durable local-only work just because it has not reached the
  // account yet. Cloud decks are authoritative online, while unsynced local
  // decks remain visible until their outbox converges.
  for (const deck of visibleLocal) {
    if (!matchedLocal.has(deck.id)) result.push(publicDeck(deck));
  }
  return result;
}

async function localNoteMap(deckId: string) {
  const notes = (await localDb.notes()).filter((note) => note.deck_id === deckId && !note.deleted);
  return new Map(notes.filter((note) => note.remote_id).map((note) => [note.remote_id!, note]));
}

async function localCardMap(deckId: string) {
  const cards = (await localDb.cards()).filter((card) => card.deck_id === deckId);
  return new Map(cards.filter((card) => card.remote_id).map((card) => [card.remote_id!, card]));
}

async function deckHasPending(deckId: string) {
  const [outbox, notes, cards] = await Promise.all([localDb.outbox(), localDb.notes(), localDb.cards()]);
  const noteIds = new Set(notes.filter((note) => note.deck_id === deckId).map((note) => note.id));
  const cardIds = new Set(cards.filter((card) => card.deck_id === deckId).map((card) => card.id));
  return outbox.some((item) => item.entity_id === deckId || noteIds.has(item.entity_id) || cardIds.has(item.entity_id));
}

async function remoteCardId(cardId: string) {
  return (await localDb.card(cardId))?.remote_id ?? cardId;
}

function mapRemoteNote(note: Note, local: LocalNote): Note {
  return { ...note, id: local.id, deck_id: local.deck_id };
}

function mapRemoteCardDetail(detail: CardDetail, local?: LocalCard): CardDetail {
  return local
    ? { ...detail, id: local.id, deck_id: local.deck_id, note_id: local.note_id ?? detail.note_id }
    : detail;
}

function mapRemotePreview(preview: StudyPreview, local?: LocalCard): StudyPreview {
  return local ? { ...preview, card_id: local.id } : preview;
}

async function refreshLocalCard(local: LocalCard, remoteId: string, reviewedAtMs: number) {
  const [detail, preview] = await Promise.all([
    remoteApi.getCard(remoteId),
    remoteApi.previewStudy(remoteId),
  ]);
  const mappedDetail = mapRemoteCardDetail(detail, local);
  const mappedPreview = mapRemotePreview(preview, local);
  const dueAt = detail.scheduler?.due_at_ms ?? local.due_at_ms;
  await localDb.putCard({
    ...local,
    summary: {
      ...local.summary,
      due_at_ms: dueAt,
      last_reviewed_at_ms: detail.scheduler?.last_reviewed_at_ms ?? reviewedAtMs,
    },
    detail: mappedDetail,
    preview: mappedPreview,
    due_at_ms: dueAt,
    pending_review: false,
  });
}

export const appApi = {
  ...localApi,

  async stats(deckId?: string): Promise<Stats> {
    if (!navigator.onLine) return localApi.stats(deckId);
    try {
      return remoteApi.stats(deckId ? await remoteDeckId(deckId) : undefined);
    } catch (reason) {
      if (!shouldFallback(reason)) throw reason;
      return localApi.stats(deckId);
    }
  },

  async listDecks(): Promise<Deck[]> {
    if (!navigator.onLine) return localApi.listDecks();
    try {
      return await mappedCloudDecks();
    } catch (reason) {
      if (!shouldFallback(reason)) throw reason;
      return localApi.listDecks();
    }
  },

  async getDeck(deckId: string): Promise<Deck> {
    if (navigator.onLine) {
      try {
        const remoteId = await remoteDeckId(deckId);
        const cloud = await remoteApi.getDeck(remoteId);
        return { ...cloud, id: deckId };
      } catch (reason) {
        if (!shouldFallback(reason)) throw reason;
      }
    }
    return localApi.getDeck(deckId);
  },

  async listNotes(deckId: string): Promise<NoteSummary[]> {
    if (navigator.onLine && !(await deckHasPending(deckId))) {
      try {
        const [remoteId, byRemote] = await Promise.all([remoteDeckId(deckId), localNoteMap(deckId)]);
        const cloud = await remoteApi.listNotes(remoteId);
        return cloud.map((note) => {
          const local = byRemote.get(note.id);
          return { ...note, id: local?.id ?? note.id, deck_id: deckId };
        });
      } catch (reason) {
        if (!shouldFallback(reason)) throw reason;
      }
    }
    return localApi.listNotes(deckId);
  },

  async listCards(deckId: string): Promise<CardSummary[]> {
    if (navigator.onLine && !(await deckHasPending(deckId))) {
      try {
        const [remoteId, byRemote] = await Promise.all([remoteDeckId(deckId), localCardMap(deckId)]);
        const cloud = await remoteApi.listCards(remoteId);
        return cloud.map((card) => {
          const local = byRemote.get(card.id);
          return {
            ...card,
            id: local?.id ?? card.id,
            deck_id: deckId,
            note_id: local?.note_id ?? card.note_id,
          };
        });
      } catch (reason) {
        if (!shouldFallback(reason)) throw reason;
      }
    }
    return localApi.listCards(deckId);
  },

  async getNote(noteId: string): Promise<Note> {
    const local = await localDb.note(noteId);
    if (!navigator.onLine || local?.dirty) return localApi.getNote(noteId);
    if (local?.remote_id) {
      try {
        return mapRemoteNote(await remoteApi.getNote(local.remote_id), local);
      } catch (reason) {
        if (!shouldFallback(reason)) throw reason;
        return localApi.getNote(noteId);
      }
    }
    if (local) return localApi.getNote(noteId);
    return remoteApi.getNote(noteId);
  },

  async createNote(deckId: string, input: NoteInput): Promise<Note> {
    const localDeck = await localDb.deck(deckId);
    if (localDeck || !navigator.onLine) return localApi.createNote(deckId, input);
    return remoteApi.createNote(await remoteDeckId(deckId), input);
  },

  async updateNote(noteId: string, input: NoteInput): Promise<Note> {
    const local = await localDb.note(noteId);
    if (local || !navigator.onLine) return localApi.updateNote(noteId, input);
    return remoteApi.updateNote(noteId, input);
  },

  async deleteNote(noteId: string) {
    const local = await localDb.note(noteId);
    if (local || !navigator.onLine) return localApi.deleteNote(noteId);
    return remoteApi.deleteNote(noteId);
  },

  async nextStudyCard(deckId: string, options: StudyNextOptions = {}): Promise<StudyNext> {
    if (navigator.onLine && !(await deckHasPending(deckId))) {
      try {
        const remoteId = await remoteDeckId(deckId);
        const next = await remoteApi.nextStudyCard(remoteId, options);
        if (!next.card) return next;
        const byRemote = await localCardMap(deckId);
        const local = byRemote.get(next.card.id);
        return {
          card: {
            ...next.card,
            id: local?.id ?? next.card.id,
            deck_id: deckId,
          },
        };
      } catch (reason) {
        if (!shouldFallback(reason)) throw reason;
      }
    }
    return localApi.nextStudyCard(deckId, options);
  },

  async getCard(cardId: string): Promise<CardDetail> {
    const local = await localDb.card(cardId);
    if (!navigator.onLine || local?.pending_review) return localApi.getCard(cardId);
    try {
      const detail = await remoteApi.getCard(local?.remote_id ?? cardId);
      return mapRemoteCardDetail(detail, local);
    } catch (reason) {
      if (!shouldFallback(reason)) throw reason;
      if (local) return localApi.getCard(cardId);
      throw reason;
    }
  },

  async previewStudy(cardId: string): Promise<StudyPreview> {
    const local = await localDb.card(cardId);
    if (!navigator.onLine || local?.pending_review) return localApi.previewStudy(cardId);
    try {
      const preview = await remoteApi.previewStudy(local?.remote_id ?? cardId);
      return mapRemotePreview(preview, local);
    } catch (reason) {
      if (!shouldFallback(reason)) throw reason;
      if (local) return localApi.previewStudy(cardId);
      throw reason;
    }
  },

  async review(cardId: string, rating: 1 | 2 | 3 | 4, expectedReviewCount: number, reviewedAtMs = Date.now()) {
    const local = await localDb.card(cardId);
    if (!navigator.onLine) return localApi.review(cardId, rating, expectedReviewCount, reviewedAtMs);

    if (local && (local.pending_review || await deckHasPending(local.deck_id))) {
      return localApi.review(cardId, rating, expectedReviewCount, reviewedAtMs);
    }

    const remoteId = local?.remote_id ?? cardId;
    await remoteApi.review(remoteId, rating, expectedReviewCount, reviewedAtMs);
    if (local) {
      try {
        await refreshLocalCard(local, remoteId, reviewedAtMs);
      } catch {
        // The review is already durable in the account cloud. A later read can
        // refresh this optional offline cache without replaying the review.
      }
    }
    return undefined;
  },
};
