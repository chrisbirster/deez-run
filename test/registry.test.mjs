import assert from "node:assert/strict";
import test from "node:test";
import { buildSitemap, compareSemver, parseNut, validateRegistryEntry } from "../scripts/registry-lib.mjs";

const validNut = [
  JSON.stringify({ kind: "deck", format: "deez.nut", version: 2, name: "Data Structures" }),
  JSON.stringify({ kind: "note", note_type: "basic", fields: ["FIFO?", "Queue"], tags_json: '["queue"]' }),
  JSON.stringify({ kind: "note", note_type: "reverse", fields: ["LIFO", "Stack"], tags_json: "[]" }),
  JSON.stringify({ kind: "note", note_type: "cloze", fields: ["{{c1::Stack}} is LIFO and {{c2::Queue}} is FIFO", ""], tags_json: "[]" }),
  JSON.stringify({
    kind: "note",
    note_type: "multiple-choice",
    fields: [
      "Average O(1) key lookup?",
      JSON.stringify([{ id: "array", text: "Array" }, { id: "hash", text: "Hash table" }]),
      "hash",
      "Uses hashing.",
    ],
    tags_json: "[]",
  }),
].join("\n");

function note(note_type, fields, tags_json = "[]") {
  return JSON.stringify({ kind: "note", note_type, fields, tags_json });
}

test("parseNut derives note types and generated card count", () => {
  const result = parseNut(validNut);
  assert.equal(result.note_count, 4);
  assert.equal(result.card_count, 6);
  assert.deepEqual(result.note_types, ["basic", "basic-reverse", "cloze", "multiple-choice"]);
  assert.equal(result.preview.length, 4);
});

test("parseNut covers every current built-in Deez note type", () => {
  const choices = JSON.stringify([{ id: "a", text: "A" }, { id: "b", text: "B" }]);
  const masks = JSON.stringify([
    { id: 1, x: 0.1, y: 0.1, width: 0.2, height: 0.2, answer: "left" },
    { id: 2, x: 0.5, y: 0.1, width: 0.2, height: 0.2, answer: "right", prompt: "Identify this" },
  ]);
  const input = [
    JSON.stringify({ kind: "deck", format: "deez.nut", version: 2, name: "All Types" }),
    note("basic", ["front", "back"]),
    note("basic-reverse", ["front", "back"]),
    note("optional-reverse", ["front", "back", "yes"]),
    note("cloze", ["{{c1::one}} {{c2::two}} {{c1::again}}", "extra"]),
    note("type-answer", ["front", "back"]),
    note("multiple-choice", ["pick one", choices, "a", "why"]),
    note("multiple-select", ["pick many", choices, JSON.stringify(["a", "b"]), "why"]),
    note("ordering", ["order", choices, "why"]),
    note("image-occlusion", ["deez-media://sha256:0000000000000000000000000000000000000000000000000000000000000000", masks, "extra"]),
  ].join("\n");

  const result = parseNut(input);
  assert.equal(result.note_count, 9);
  assert.equal(result.card_count, 13);
  assert.deepEqual(result.note_types, [
    "basic",
    "basic-reverse",
    "cloze",
    "image-occlusion",
    "multiple-choice",
    "multiple-select",
    "optional-reverse",
    "ordering",
    "type-answer",
  ]);
});

test("parseNut accepts current aliases and canonicalizes them", () => {
  const choices = JSON.stringify([{ id: "a", text: "A" }, { id: "b", text: "B" }]);
  const masks = JSON.stringify([{ id: 1, x: 0, y: 0, width: 0.2, height: 0.2, answer: "x" }]);
  const input = [
    JSON.stringify({ kind: "deck", format: "deez.nut", version: 2, name: "Aliases" }),
    note("reverse", ["a", "b"]),
    note("type", ["a", "b"]),
    note("mcq", ["q", choices, "a", ""]),
    note("multi-select", ["q", choices, '["a"]', ""]),
    note("order", ["q", choices, ""]),
    note("occlusion", ["deez-media://sha256:0000000000000000000000000000000000000000000000000000000000000000", masks, ""]),
  ].join("\n");

  assert.deepEqual(parseNut(input).note_types, [
    "basic-reverse",
    "image-occlusion",
    "multiple-choice",
    "multiple-select",
    "ordering",
    "type-answer",
  ]);
});

test("parseNut rejects unknown record fields like the core importer", () => {
  const input = `${JSON.stringify({ kind: "deck", format: "deez.nut", version: 2, name: "x", surprise: true })}\n`;
  assert.throws(() => parseNut(input), /unknown field surprise/);
});

test("parseNut accepts user HTML as inert data rather than interpreting it", () => {
  const input = [
    JSON.stringify({ kind: "deck", format: "deez.nut", version: 2, name: "Untrusted" }),
    JSON.stringify({ kind: "note", note_type: "basic", fields: ["<script>alert(1)</script>", "answer"], tags_json: "[]" }),
  ].join("\n");
  const result = parseNut(input);
  assert.equal(result.preview[0].fields[0], "<script>alert(1)</script>");
});

test("parseNut rejects invalid interaction references and media rectangles", () => {
  const choices = JSON.stringify([{ id: "a", text: "A" }, { id: "b", text: "B" }]);
  const badChoice = [
    JSON.stringify({ kind: "deck", format: "deez.nut", version: 2, name: "Bad" }),
    note("multiple-choice", ["q", choices, "missing", ""]),
  ].join("\n");
  assert.throws(() => parseNut(badChoice), /unknown choice id/);

  const badMask = [
    JSON.stringify({ kind: "deck", format: "deez.nut", version: 2, name: "Bad" }),
    note("image-occlusion", [
      "deez-media://sha256:0000000000000000000000000000000000000000000000000000000000000000",
      JSON.stringify([{ id: 1, x: 0.9, y: 0.1, width: 0.2, height: 0.2, answer: "x" }]),
      "",
    ]),
  ].join("\n");
  assert.throws(() => parseNut(badMask), /invalid normalized rectangle/);
});

test("registry entry requires immutable commit and checksum identity", () => {
  assert.throws(
    () => validateRegistryEntry({
      schema_version: 1,
      slug: "demo",
      name: "Demo",
      description: "Demo deck",
      authors: [{ github: "octocat" }],
      tags: [],
      source: { type: "github", repository: "octocat/demo" },
      versions: [{ version: "1.0.0", commit: "main", path: "demo.nut", sha256: "x" }],
    }),
    /full lowercase Git commit SHA/,
  );
});

test("semantic versions sort releases after prereleases", () => {
  assert.ok(compareSemver("1.0.0", "1.0.0-rc.1") > 0);
  assert.ok(compareSemver("1.1.0", "1.0.9") > 0);
});

test("sitemap includes stable public routes and deduplicated authors", () => {
  const xml = buildSitemap([
    { slug: "one", authors: [{ github: "alice" }, { github: "bob" }] },
    { slug: "two", authors: [{ github: "alice" }] },
  ]);
  assert.match(xml, /https:\/\/deez\.run\/nuts\/one/);
  assert.match(xml, /https:\/\/deez\.run\/nuts\/two/);
  assert.equal((xml.match(/https:\/\/deez\.run\/authors\/alice/g) ?? []).length, 1);
  assert.doesNotMatch(xml, /\/search/);
});
