export * from "./remoteApi";

import { appApi as accountApi } from "./accountClientApi";
import { localDb } from "./localDb";
import { hydrateDeckForOffline, type OfflineSyncProgress } from "./localReplication";
import { appApi as remoteApi, type DeckSnapshot } from "./remoteApi";

function changed(deckId?: string) {
  window.dispatchEvent(new CustomEvent("deez:cloud-changed", { detail: { deckId } }));
}

async function remoteDeckId(deckId: string) {
  return (await localDb.deck(deckId))?.remote_id ?? deckId;
}

async function remoteCardId(cardId: string) {
  return (await localDb.card(cardId))?.remote_id ?? cardId;
}

export const appApi = {
  ...accountApi,

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
