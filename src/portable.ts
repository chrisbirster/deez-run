export type PortableNote = {
  note_type: string;
  fields: string[];
  tags: string[];
};

export type PortableDeck = {
  name: string;
  notes: PortableNote[];
  source: "nut-v1" | "nut-v2" | "json-v1" | "json-v2";
};

type JsonObject = Record<string, unknown>;

function asObject(value: unknown, context: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${context} must be a JSON object.`);
  }
  return value as JsonObject;
}

function expectKeys(value: JsonObject, allowed: readonly string[], context: string) {
  const allowedSet = new Set(allowed);
  const unknown = Object.keys(value).filter((key) => !allowedSet.has(key));
  if (unknown.length) throw new Error(`${context} contains unknown field ${unknown[0]}.`);
}

function nonEmptyText(value: unknown, name: string) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${name} must be non-empty text.`);
  return value;
}

function stringArray(value: unknown, name: string, allowEmpty = true): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${name} must be an array of strings.`);
  }
  if (!allowEmpty && value.length === 0) throw new Error(`${name} must contain at least one value.`);
  return [...value] as string[];
}

function tagsJson(value: unknown): string[] {
  if (value === undefined) return [];
  if (typeof value !== "string") throw new Error("tags_json must be a JSON string.");
  const parsed = JSON.parse(value) as unknown;
  return stringArray(parsed, "tags_json");
}

function noteFromObject(value: JsonObject, context: string): PortableNote {
  expectKeys(value, ["kind", "note_type", "fields", "tags_json"], context);
  const noteType = nonEmptyText(value.note_type, `${context} note_type`);
  const fields = stringArray(value.fields, `${context} fields`, false);
  return { note_type: noteType, fields, tags: tagsJson(value.tags_json) };
}

export function parseNut(source: string): PortableDeck {
  const lines = source.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) throw new Error("The .nut file is empty.");

  const header = asObject(JSON.parse(lines[0]), ".nut header");
  expectKeys(header, ["kind", "format", "version", "name"], ".nut header");
  if (header.kind !== "deck" || header.format !== "deez.nut") {
    throw new Error("The first .nut record must be a deez.nut deck header.");
  }
  if (header.version !== 1 && header.version !== 2) throw new Error("Only .nut versions 1 and 2 are supported.");
  const name = nonEmptyText(header.name, "Deck name");
  const notes: PortableNote[] = [];

  for (const [offset, line] of lines.slice(1).entries()) {
    const context = `.nut record ${offset + 2}`;
    const value = asObject(JSON.parse(line), context);
    if (header.version === 1) {
      expectKeys(value, ["kind", "question", "answer"], context);
      if (value.kind !== "card") throw new Error("A .nut v1 deck may only contain card records after the header.");
      notes.push({
        note_type: "basic",
        fields: [nonEmptyText(value.question, "Question"), nonEmptyText(value.answer, "Answer")],
        tags: [],
      });
      continue;
    }
    if (value.kind !== "note") throw new Error("A .nut v2 deck may only contain note records after the header.");
    notes.push(noteFromObject(value, context));
  }

  return { name, notes, source: header.version === 1 ? "nut-v1" : "nut-v2" };
}

export function parseDeckJson(source: string): PortableDeck {
  const root = asObject(JSON.parse(source), "Deck JSON");
  expectKeys(root, ["format", "version", "deck"], "Deck JSON");
  if (root.format !== "deez.deck") throw new Error("JSON deck format must be deez.deck.");
  if (root.version !== 1 && root.version !== 2) throw new Error("Only deez.deck versions 1 and 2 are supported.");
  const deck = asObject(root.deck, "deck");

  if (root.version === 1) {
    expectKeys(deck, ["name", "cards"], "deck");
    const name = nonEmptyText(deck.name, "Deck name");
    if (!Array.isArray(deck.cards)) throw new Error("deck.cards must be an array.");
    const notes = deck.cards.map((raw, index): PortableNote => {
      const card = asObject(raw, `card ${index + 1}`);
      expectKeys(card, ["question", "answer"], `card ${index + 1}`);
      return {
        note_type: "basic",
        fields: [nonEmptyText(card.question, "Question"), nonEmptyText(card.answer, "Answer")],
        tags: [],
      };
    });
    return { name, notes, source: "json-v1" };
  }

  expectKeys(deck, ["name", "notes"], "deck");
  const name = nonEmptyText(deck.name, "Deck name");
  if (!Array.isArray(deck.notes)) throw new Error("deck.notes must be an array.");
  const notes = deck.notes.map((raw, index): PortableNote => {
    const note = asObject(raw, `note ${index + 1}`);
    expectKeys(note, ["note_type", "fields", "tags_json"], `note ${index + 1}`);
    return noteFromObject({ ...note, kind: "note" }, `note ${index + 1}`);
  });
  return { name, notes, source: "json-v2" };
}

export function parsePortableDeck(source: string, filename = "") {
  const trimmed = source.trimStart();
  if (filename.toLowerCase().endsWith(".nut")) return parseNut(source);
  if (filename.toLowerCase().endsWith(".json")) return parseDeckJson(source);
  if (trimmed.startsWith("{\"kind\"") || /\"format\"\s*:\s*\"deez\.nut\"/.test(trimmed.split(/\r?\n/, 1)[0] ?? "")) {
    return parseNut(source);
  }
  return parseDeckJson(source);
}

export function serializeNutV2(name: string, notes: readonly PortableNote[]) {
  const lines = [JSON.stringify({ kind: "deck", format: "deez.nut", version: 2, name })];
  for (const note of notes) {
    lines.push(JSON.stringify({
      kind: "note",
      note_type: note.note_type,
      fields: note.fields,
      tags_json: JSON.stringify(note.tags),
    }));
  }
  return `${lines.join("\n")}\n`;
}

export function serializeDeckJsonV2(name: string, notes: readonly PortableNote[]) {
  return `${JSON.stringify({
    format: "deez.deck",
    version: 2,
    deck: {
      name,
      notes: notes.map((note) => ({
        note_type: note.note_type,
        fields: note.fields,
        tags_json: JSON.stringify(note.tags),
      })),
    },
  }, null, 2)}\n`;
}

export function portableFilename(name: string, format: "nut" | "json") {
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return `${slug || "deez-deck"}.${format === "nut" ? "nut" : "json"}`;
}
