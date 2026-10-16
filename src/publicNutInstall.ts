import { parsePortableDeck } from "./portable";
import { appApi as remoteApi, type Deck, type NoteInput } from "./remoteApi";
import type { CatalogEntry } from "./lib/catalog";

const bulkSize = 50;

function hex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes), (value) => value.toString(16).padStart(2, "0")).join("");
}

async function verifySha256(text: string, expected: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  if (hex(digest) !== expected.toLowerCase()) throw new Error("Public nut checksum verification failed.");
}

function mirroredNutUrl(entry: CatalogEntry) {
  return `/registry-nuts/${encodeURIComponent(entry.slug)}/${encodeURIComponent(entry.latest.version)}.nut`;
}

function importName(entry: CatalogEntry, existing: Deck[]) {
  const sameName = existing.filter((deck) => deck.name === entry.name);
  const complete = sameName.find((deck) =>
    deck.note_count === entry.latest.note_count && deck.card_count === entry.latest.card_count
  );
  if (complete) return { existing: complete, name: complete.name };
  return {
    existing: undefined,
    name: sameName.length ? `${entry.name} (public ${entry.latest.version})` : entry.name,
  };
}

export async function installCatalogNut(entry: CatalogEntry): Promise<Deck> {
  // Authenticate before fetching/parsing a potentially large public deck.
  await remoteApi.me();

  const existing = await remoteApi.listDecks();
  const target = importName(entry, existing);
  if (target.existing) return target.existing;

  const response = await fetch(mirroredNutUrl(entry), {
    credentials: "same-origin",
    headers: { Accept: "application/x-ndjson,text/plain" },
  });
  if (!response.ok) throw new Error(`Unable to load public nut (${response.status}).`);
  const text = await response.text();
  await verifySha256(text, entry.latest.sha256);

  const parsed = parsePortableDeck(text, `${entry.slug}.nut`);
  if (parsed.notes.length !== entry.latest.note_count) {
    throw new Error(`Public nut note count changed: expected ${entry.latest.note_count}, got ${parsed.notes.length}.`);
  }

  const deck = await remoteApi.createDeck(target.name);
  try {
    const notes: NoteInput[] = parsed.notes.map((note) => ({
      note_type: note.note_type,
      fields: [...note.fields],
      tags: [...note.tags],
    }));
    for (let index = 0; index < notes.length; index += bulkSize) {
      await remoteApi.createNotesBulk(deck.id, notes.slice(index, index + bulkSize));
    }
    const installed = await remoteApi.getDeck(deck.id);
    if (installed.note_count !== entry.latest.note_count || installed.card_count !== entry.latest.card_count) {
      throw new Error(
        `Server generated ${installed.note_count} notes / ${installed.card_count} cards; expected ${entry.latest.note_count} / ${entry.latest.card_count}.`,
      );
    }
    return installed;
  } catch (reason) {
    try { await remoteApi.deleteDeck(deck.id); } catch { /* preserve original failure */ }
    throw reason;
  }
}
