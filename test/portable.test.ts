import assert from "node:assert/strict";
import test from "node:test";
import {
  importPortableDeck,
  parseDeckJson,
  parseNut,
  serializeDeckJsonV2,
  serializeNutV2,
  type PortableDeck,
} from "../src/portable.ts";

const logicalNotes = [
  { note_type: "basic", fields: ["Question", "Answer"], tags: ["one"] },
  { note_type: "basic-reverse", fields: ["France", "Paris"], tags: ["geo"] },
  { note_type: "cloze", fields: ["Paris is the capital of {{c1::France}}.", "Europe"], tags: [] },
  { note_type: "type-answer", fields: ["2 + 2", "4"], tags: ["math"] },
];

test(".nut v1 imports legacy cards as basic logical notes", () => {
  const parsed = parseNut([
    JSON.stringify({ kind: "deck", format: "deez.nut", version: 1, name: "Legacy" }),
    JSON.stringify({ kind: "card", question: "q", answer: "a" }),
  ].join("\n"));
  assert.equal(parsed.source, "nut-v1");
  assert.deepEqual(parsed.notes, [{ note_type: "basic", fields: ["q", "a"], tags: [] }]);
});

test(".nut v2 round trips logical reverse and cloze notes", () => {
  const encoded = serializeNutV2("Study", logicalNotes);
  const parsed = parseNut(encoded);
  assert.equal(parsed.name, "Study");
  assert.equal(parsed.source, "nut-v2");
  assert.deepEqual(parsed.notes, logicalNotes);
});

test("deez.deck v1 remains compatible", () => {
  const parsed = parseDeckJson(JSON.stringify({
    format: "deez.deck",
    version: 1,
    deck: { name: "Legacy JSON", cards: [{ question: "byte", answer: "8 bits" }] },
  }));
  assert.equal(parsed.source, "json-v1");
  assert.deepEqual(parsed.notes, [{ note_type: "basic", fields: ["byte", "8 bits"], tags: [] }]);
});

test("deez.deck v2 round trips logical notes without scheduler state", () => {
  const encoded = serializeDeckJsonV2("Study", logicalNotes);
  assert.equal(encoded.includes("reviews"), false);
  assert.equal(encoded.includes("scheduler"), false);
  const parsed = parseDeckJson(encoded);
  assert.equal(parsed.source, "json-v2");
  assert.deepEqual(parsed.notes, logicalNotes);
});

test("portable parsers reject unknown fields rather than silently dropping them", () => {
  assert.throws(() => parseNut([
    JSON.stringify({ kind: "deck", format: "deez.nut", version: 2, name: "Strict", surprise: true }),
  ].join("\n")), /unknown field surprise/);

  assert.throws(() => parseDeckJson(JSON.stringify({
    format: "deez.deck",
    version: 2,
    deck: { name: "Strict", notes: [], surprise: true },
  })), /unknown field surprise/);
});

test("portable import rolls back a partially-created hosted deck", async () => {
  const parsed: PortableDeck = {
    name: "Rollback",
    source: "nut-v2",
    notes: [
      { note_type: "basic", fields: ["one", "1"], tags: [] },
      { note_type: "basic", fields: ["two", "2"], tags: [] },
    ],
  };
  const events: string[] = [];
  await assert.rejects(() => importPortableDeck(parsed, {
    async createDeck(name) { events.push(`deck:${name}`); return { id: "42" }; },
    async createNote(_deckId, note) {
      events.push(`note:${note.fields[0]}`);
      if (note.fields[0] === "two") throw new Error("server rejected note");
    },
    async deleteDeck(id) { events.push(`delete:${id}`); },
  }), /server rejected note/);
  assert.deepEqual(events, ["deck:Rollback", "note:one", "note:two", "delete:42"]);
});
