import assert from "node:assert/strict";
import test from "node:test";
import { compareSemver, parseNut, validateRegistryEntry } from "../scripts/registry-lib.mjs";

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

test("parseNut derives note types and generated card count", () => {
  const result = parseNut(validNut);
  assert.equal(result.note_count, 4);
  assert.equal(result.card_count, 6);
  assert.deepEqual(result.note_types, ["basic", "basic-reverse", "cloze", "multiple-choice"]);
  assert.equal(result.preview.length, 4);
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
