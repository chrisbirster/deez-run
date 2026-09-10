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
import { localDb, type LocalCard, type LocalDeck } from "./localDb";

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

function mapRemoteCardDetail(detail: CardDetail, local?: LocalCard): CardDetail {
  return local
    ? { ...detail, id: local.id, deck_id: local.deck_id, note_id: local.note_id ?? detail.note_id }
    : detail;
}

function mapRemotePreview(preview: StudyPreview, local?: LocalCard): StudyPreview {
  return local ? { ...preview, card_id: local.id } : preview;
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
    if (local) return localApi.getNote(noteId);
    if (navigator.onLine) return remoteApi.getNote(noteId);
    return localApi.getNote(noteId);
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
    if (local) return localApi.getCard(cardId);
    if (!navigator.onLine) return localApi.getCard(cardId);
    const detail = await remoteApi.getCard(cardId);
    return detail;
  },

  async previewStudy(cardId: string): Promise<StudyPreview> {
    const local = await localDb.card(cardId);
    if (local) return localApi.previewStudy(cardId);
    if (!navigator.onLine) return localApi.previewStudy(cardId);
    return remoteApi.previewStudy(cardId);
  },

  async review(cardId: string, rating: 1 | 2 | 3 | 4, expectedReviewCount: number, reviewedAtMs = Date.now()) {
    const local = await localDb.card(cardId);
    if (!navigator.onLine) return localApi.review(cardId, rating, expectedReviewCount, reviewedAtMs);

    // When the card is already fully mirrored locally, preserve the existing
    // durable offline-first review path. A card selected directly from the
    // account cloud on a new device can be reviewed without waiting for a
    // multi-thousand-card IndexedDB hydration first.
    if (local) return localApi.review(cardId, rating, expectedReviewCount, reviewedAtMs);

    await remoteApi.review(await remoteCardId(cardId), rating, expectedReviewCount, reviewedAtMs);
    return undefined;
  },
};
