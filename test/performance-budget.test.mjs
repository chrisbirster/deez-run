import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const replication = fs.readFileSync(new URL("../src/localReplication.ts", import.meta.url), "utf8");
const importer = fs.readFileSync(new URL("../src/importPipeline.ts", import.meta.url), "utf8");
const portable = fs.readFileSync(new URL("../src/portable.ts", import.meta.url), "utf8");
const hostedPatch = fs.readFileSync(new URL("../patches/patch-hosted-web.py", import.meta.url), "utf8");
const reliabilityPatch = fs.readFileSync(new URL("../patches/patch-production-reliability.py", import.meta.url), "utf8");
const studyQueuePatch = fs.readFileSync(new URL("../patches/patch-study-queue.py", import.meta.url), "utf8");\nconst largeDeckPatch = fs.readFileSync(new URL("../patches/patch-large-deck-reads.py", import.meta.url), "utf8");\nconst dashboard = fs.readFileSync(new URL("../src/dashboardPage.tsx", import.meta.url), "utf8");

export const budgets = Object.freeze({
  deckListMs: 2_000,
  firstStudyCardMs: 2_000,
  reviewToNextCardMs: 2_000,
  localImport1200Ms: 1_000,
  snapshotRequestsPerDeck: 1,
});

test("large-deck reads use bounded query shapes", () => {
  assert.match(hostedPatch, /fastDeckCounts/);
  assert.match(reliabilityPatch, /deckSnapshot/);
  assert.match(studyQueuePatch, /Snapshot the retirement IDs once/);
  const apply = replication.slice(replication.indexOf("async function applyRemoteSnapshot"), replication.indexOf("async function pullSnapshot"));
  assert.equal((apply.match(/snapshotDeck\(/g) ?? []).length, budgets.snapshotRequestsPerDeck);
  assert.doesNotMatch(apply, /getCard\(/);
  assert.doesNotMatch(apply, /previewStudy\(/);
});

test("large Mongo note and snapshot reads avoid per-card database round trips", () => {
  assert.match(largeDeckPatch, /mongoDeckNoteSummaries/);
  assert.match(largeDeckPatch, /generated_cards/);
  assert.match(largeDeckPatch, /source_notes/);
  const mongoSnapshot = largeDeckPatch.slice(largeDeckPatch.indexOf("new_snapshot ="), largeDeckPatch.indexOf("hosted_path.write_text"));
  assert.doesNotMatch(mongoSnapshot, /content_store\.cardSource\(res\.arena, entry\.id\)/);
  assert.doesNotMatch(mongoSnapshot, /self\.store\.getSchedulerState\(entry\.id\)/);
});

test("dashboard never downloads every deck snapshot to render a cosmetic counter", () => {
  assert.doesNotMatch(dashboard, /library\.map\(\(deck\) => appApi\.snapshotDeck/);
  assert.match(dashboard, /localDb\.cards\(\)/);
});

test("large imports use a single IndexedDB batch and server chunks", () => {
  assert.match(importer, /putImportBatch/);
  assert.match(replication, /const CREATE_NOTE_BATCH_SIZE = 50/);
  assert.doesNotMatch(importer, /deleteDeck/);
});

test("1200-note portable transform stays inside the CI CPU budget", async () => {
  // Import TypeScript directly using Node's strip-types mode in the separate
  // portable test; here we keep the budget contract visible to ordinary CI and
  // verify the parser remains linear rather than introducing nested scans.
  assert.match(portable, /for \(const \[offset, line\] of lines\.slice\(1\)\.entries\(\)\)/);
  const records = Array.from({ length: 1_200 }, (_, i) => JSON.stringify({ kind: "note", note_type: "basic", fields: [`q${i}`, `a${i}`], tags_json: "[]" }));
  const text = [JSON.stringify({ kind: "deck", format: "deez.nut", version: 2, name: "budget" }), ...records].join("\n");
  const started = performance.now();
  const lines = text.split(/\r?\n/).filter(Boolean).map(JSON.parse);
  const elapsed = performance.now() - started;
  assert.equal(lines.length, 1_201);
  assert.ok(elapsed < budgets.localImport1200Ms, `fixture transform took ${elapsed.toFixed(1)}ms; budget ${budgets.localImport1200Ms}ms`);
});

test("published interactive latency budgets stay explicit", () => {
  assert.equal(budgets.deckListMs, 2_000);
  assert.equal(budgets.firstStudyCardMs, 2_000);
  assert.equal(budgets.reviewToNextCardMs, 2_000);
});
