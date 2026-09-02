import type { CardDetail, CardSummary, Deck, Note, StudyPreview } from "./appApi";

const DB_NAME = "deez-local-first-v1";
const DB_VERSION = 1;
const DECKS = "decks";
const NOTES = "notes";
const CARDS = "cards";
const OUTBOX = "outbox";
const META = "meta";

export type LocalDeck = Deck & {
  remote_id?: string;
  dirty: boolean;
  deleted: boolean;
  base_remote_name?: string;
};

export type LocalNote = Note & {
  remote_id?: string;
  remote_deck_id?: string;
  dirty: boolean;
  deleted: boolean;
  base_remote_updated_at_ms?: number;
};

export type LocalCard = {
  id: string;
  remote_id?: string;
  deck_id: string;
  note_id?: string;
  summary: CardSummary;
  detail: CardDetail;
  preview: StudyPreview;
  due_at_ms: number;
  pending_review: boolean;
};

export type OutboxKind =
  | "create_deck"
  | "rename_deck"
  | "delete_deck"
  | "create_note"
  | "update_note"
  | "delete_note"
  | "review";

export type OutboxItem = {
  id: string;
  kind: OutboxKind;
  entity_id: string;
  created_at_ms: number;
  payload: Record<string, unknown>;
  conflict?: string;
};

type MetaRecord = { key: string; value: unknown };

function req<T = undefined>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function txDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
  });
}

async function db() {
  const opened = indexedDB.open(DB_NAME, DB_VERSION);
  opened.onupgradeneeded = () => {
    const database = opened.result;
    if (!database.objectStoreNames.contains(DECKS)) database.createObjectStore(DECKS, { keyPath: "id" });
    if (!database.objectStoreNames.contains(NOTES)) database.createObjectStore(NOTES, { keyPath: "id" });
    if (!database.objectStoreNames.contains(CARDS)) database.createObjectStore(CARDS, { keyPath: "id" });
    if (!database.objectStoreNames.contains(OUTBOX)) database.createObjectStore(OUTBOX, { keyPath: "id" });
    if (!database.objectStoreNames.contains(META)) database.createObjectStore(META, { keyPath: "key" });
  };
  return req(opened);
}

async function all<T>(storeName: string): Promise<T[]> {
  const database = await db();
  try {
    const transaction = database.transaction(storeName, "readonly");
    return await req(transaction.objectStore(storeName).getAll()) as T[];
  } finally {
    database.close();
  }
}

async function get<T>(storeName: string, key: IDBValidKey): Promise<T | undefined> {
  const database = await db();
  try {
    const transaction = database.transaction(storeName, "readonly");
    return await req(transaction.objectStore(storeName).get(key)) as T | undefined;
  } finally {
    database.close();
  }
}

async function put<T>(storeName: string, value: T) {
  const database = await db();
  try {
    const transaction = database.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).put(value);
    await txDone(transaction);
  } finally {
    database.close();
  }
}

async function remove(storeName: string, key: IDBValidKey) {
  const database = await db();
  try {
    const transaction = database.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).delete(key);
    await txDone(transaction);
  } finally {
    database.close();
  }
}

async function putWithOutbox<T>(storeName: string, value: T, outbox: OutboxItem) {
  const database = await db();
  try {
    const transaction = database.transaction([storeName, OUTBOX], "readwrite");
    transaction.objectStore(storeName).put(value);
    transaction.objectStore(OUTBOX).put(outbox);
    await txDone(transaction);
  } finally {
    database.close();
  }
}

export function localId(prefix: "deck" | "note" | "review") {
  return `${prefix}:local:${crypto.randomUUID()}`;
}

export const localDb = {
  decks: () => all<LocalDeck>(DECKS),
  deck: (id: string) => get<LocalDeck>(DECKS, id),
  putDeck: (value: LocalDeck) => put(DECKS, value),
  putDeckWithOutbox: (value: LocalDeck, outbox: OutboxItem) => putWithOutbox(DECKS, value, outbox),
  deleteDeckRecord: (id: string) => remove(DECKS, id),

  notes: () => all<LocalNote>(NOTES),
  note: (id: string) => get<LocalNote>(NOTES, id),
  putNote: (value: LocalNote) => put(NOTES, value),
  putNoteWithOutbox: (value: LocalNote, outbox: OutboxItem) => putWithOutbox(NOTES, value, outbox),
  deleteNoteRecord: (id: string) => remove(NOTES, id),

  cards: () => all<LocalCard>(CARDS),
  card: (id: string) => get<LocalCard>(CARDS, id),
  putCard: (value: LocalCard) => put(CARDS, value),
  putCardWithOutbox: (value: LocalCard, outbox: OutboxItem) => putWithOutbox(CARDS, value, outbox),
  deleteCardRecord: (id: string) => remove(CARDS, id),

  outbox: async () => (await all<OutboxItem>(OUTBOX)).sort((a, b) => a.created_at_ms - b.created_at_ms || a.id.localeCompare(b.id)),
  putOutbox: (value: OutboxItem) => put(OUTBOX, value),
  deleteOutbox: (id: string) => remove(OUTBOX, id),

  async meta<T>(key: string): Promise<T | undefined> {
    return (await get<MetaRecord>(META, key))?.value as T | undefined;
  },
  putMeta: (key: string, value: unknown) => put(META, { key, value } satisfies MetaRecord),

  async resetAccountData() {
    const database = await db();
    try {
      const transaction = database.transaction([DECKS, NOTES, CARDS, OUTBOX, META], "readwrite");
      transaction.objectStore(DECKS).clear();
      transaction.objectStore(NOTES).clear();
      transaction.objectStore(CARDS).clear();
      transaction.objectStore(OUTBOX).clear();
      transaction.objectStore(META).clear();
      await txDone(transaction);
    } finally {
      database.close();
    }
  },
};
