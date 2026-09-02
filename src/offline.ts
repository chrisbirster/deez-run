import { ApiError, appApi, type CardDetail, type CardSummary, type Deck, type StudyPreview } from "./appApi";

const DB_NAME = "deez-offline-v1";
const DB_VERSION = 1;
const DECKS = "decks";
const QUEUE = "review-queue";

type Rating = 1 | 2 | 3 | 4;

type OfflineCard = {
  summary: CardSummary;
  detail: CardDetail;
  preview: StudyPreview;
  dueAtMs: number;
  pendingReview: boolean;
};

export type OfflineDeck = {
  id: string;
  deck: Deck;
  downloadedAtMs: number;
  cards: OfflineCard[];
};

export type QueuedReview = {
  id: string;
  deckId: string;
  cardId: string;
  rating: Rating;
  expectedReviewCount: number;
  reviewedAtMs: number;
};

function request<T = undefined>(value: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    value.onsuccess = () => resolve(value.result);
    value.onerror = () => reject(value.error ?? new Error("IndexedDB request failed"));
  });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
  });
}

async function openDb() {
  const opened = indexedDB.open(DB_NAME, DB_VERSION);
  opened.onupgradeneeded = () => {
    const db = opened.result;
    if (!db.objectStoreNames.contains(DECKS)) db.createObjectStore(DECKS, { keyPath: "id" });
    if (!db.objectStoreNames.contains(QUEUE)) db.createObjectStore(QUEUE, { keyPath: "id" });
  };
  return request(opened);
}

async function getDeck(id: string): Promise<OfflineDeck | undefined> {
  const db = await openDb();
  try {
    const tx = db.transaction(DECKS, "readonly");
    return await request(tx.objectStore(DECKS).get(id)) as OfflineDeck | undefined;
  } finally {
    db.close();
  }
}

async function putDeck(deck: OfflineDeck) {
  const db = await openDb();
  try {
    const tx = db.transaction(DECKS, "readwrite");
    tx.objectStore(DECKS).put(deck);
    await transactionDone(tx);
  } finally {
    db.close();
  }
}

async function deleteQueueItem(id: string) {
  const db = await openDb();
  try {
    const tx = db.transaction(QUEUE, "readwrite");
    tx.objectStore(QUEUE).delete(id);
    await transactionDone(tx);
  } finally {
    db.close();
  }
}

async function putQueueItem(item: QueuedReview) {
  const db = await openDb();
  try {
    const tx = db.transaction(QUEUE, "readwrite");
    tx.objectStore(QUEUE).put(item);
    await transactionDone(tx);
  } finally {
    db.close();
  }
}

export async function listOfflineDecks(): Promise<OfflineDeck[]> {
  const db = await openDb();
  try {
    const tx = db.transaction(DECKS, "readonly");
    return await request(tx.objectStore(DECKS).getAll()) as OfflineDeck[];
  } finally {
    db.close();
  }
}

export async function queuedReviews(): Promise<QueuedReview[]> {
  const db = await openDb();
  try {
    const tx = db.transaction(QUEUE, "readonly");
    const values = await request(tx.objectStore(QUEUE).getAll()) as QueuedReview[];
    return values.sort((a, b) => a.reviewedAtMs - b.reviewedAtMs);
  } finally {
    db.close();
  }
}

function mediaUrls(detail: CardDetail) {
  const text = `${detail.rendered.front}\n${detail.rendered.back}`;
  const matches = text.match(/\/api\/v1\/media\/[A-Za-z0-9._~-]+/g) ?? [];
  return [...new Set(matches)];
}

async function warmMedia(detail: CardDetail) {
  await Promise.all(mediaUrls(detail).map(async (url) => {
    try { await fetch(url, { credentials: "same-origin" }); } catch { /* service worker runtime cache is best-effort */ }
  }));
}

export async function prepareDeckOffline(deckId: string, onProgress?: (done: number, total: number) => void) {
  const [deck, summaries] = await Promise.all([appApi.getDeck(deckId), appApi.listCards(deckId)]);
  const cards: OfflineCard[] = [];
  let done = 0;
  for (const summary of summaries) {
    const [detail, preview] = await Promise.all([appApi.getCard(summary.id), appApi.previewStudy(summary.id)]);
    await warmMedia(detail);
    cards.push({
      summary,
      detail,
      preview,
      dueAtMs: summary.due_at_ms ?? 0,
      pendingReview: false,
    });
    done += 1;
    onProgress?.(done, summaries.length);
  }
  const offline: OfflineDeck = { id: deckId, deck, downloadedAtMs: Date.now(), cards };
  await putDeck(offline);
  return offline;
}

export async function offlineDeck(deckId: string) {
  return getDeck(deckId);
}

export async function nextOfflineCard(deckId: string, now = Date.now()) {
  const deck = await getDeck(deckId);
  if (!deck) return undefined;
  return deck.cards
    .filter((card) => !card.pendingReview && card.dueAtMs <= now)
    .sort((a, b) => a.dueAtMs - b.dueAtMs)[0];
}

export async function queueOfflineReview(deckId: string, cardId: string, rating: Rating, reviewedAtMs = Date.now()) {
  const deck = await getDeck(deckId);
  if (!deck) throw new Error("This deck has not been downloaded for offline study.");
  const card = deck.cards.find((candidate) => candidate.detail.id === cardId);
  if (!card) throw new Error("This card is not in the offline deck cache.");
  if (card.pendingReview) throw new Error("This card already has an offline review waiting to sync.");

  const key: Record<Rating, "again" | "hard" | "good" | "easy"> = {
    1: "again",
    2: "hard",
    3: "good",
    4: "easy",
  };
  const candidate = card.preview.schedule[key[rating]];
  card.pendingReview = true;
  card.dueAtMs = candidate.due_at_ms;
  card.summary = { ...card.summary, due_at_ms: candidate.due_at_ms, last_reviewed_at_ms: reviewedAtMs };
  await putDeck(deck);

  const item: QueuedReview = {
    id: `${cardId}:${reviewedAtMs}`,
    deckId,
    cardId,
    rating,
    expectedReviewCount: card.preview.review_count,
    reviewedAtMs,
  };
  await putQueueItem(item);
  return item;
}

async function refreshCard(deckId: string, cardId: string) {
  const deck = await getDeck(deckId);
  if (!deck) return;
  const index = deck.cards.findIndex((candidate) => candidate.detail.id === cardId);
  if (index < 0) return;
  const [detail, preview] = await Promise.all([appApi.getCard(cardId), appApi.previewStudy(cardId)]);
  const current = deck.cards[index];
  deck.cards[index] = {
    ...current,
    detail,
    preview,
    dueAtMs: detail.reviews?.at(-1)?.reviewed_at_ms === current.summary.last_reviewed_at_ms
      ? current.dueAtMs
      : current.dueAtMs,
    pendingReview: false,
  };
  const summaries = await appApi.listCards(deckId);
  const summary = summaries.find((candidate) => candidate.id === cardId);
  if (summary) {
    deck.cards[index].summary = summary;
    deck.cards[index].dueAtMs = summary.due_at_ms ?? 0;
  }
  await putDeck(deck);
}

export async function flushOfflineReviews() {
  if (!navigator.onLine) return { synced: 0, remaining: (await queuedReviews()).length };
  const queue = await queuedReviews();
  let synced = 0;
  for (const item of queue) {
    try {
      await appApi.review(item.cardId, item.rating, item.expectedReviewCount, item.reviewedAtMs);
      await deleteQueueItem(item.id);
      await refreshCard(item.deckId, item.cardId);
      synced += 1;
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 401) break;
      if (reason instanceof ApiError && reason.status === 409) continue;
      if (!navigator.onLine) break;
      throw reason;
    }
  }
  return { synced, remaining: (await queuedReviews()).length };
}

export async function offlineStatus(deckId: string) {
  const [deck, queue] = await Promise.all([getDeck(deckId), queuedReviews()]);
  return {
    ready: Boolean(deck),
    downloadedAtMs: deck?.downloadedAtMs,
    cards: deck?.cards.length ?? 0,
    pendingReviews: queue.filter((item) => item.deckId === deckId).length,
  };
}
