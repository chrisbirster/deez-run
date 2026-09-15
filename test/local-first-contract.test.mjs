import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const localDb = fs.readFileSync(new URL("../src/localDb.ts", import.meta.url), "utf8");
const client = fs.readFileSync(new URL("../src/localClientApi.ts", import.meta.url), "utf8");
const accountClient = fs.readFileSync(new URL("../src/accountClientApi.ts", import.meta.url), "utf8");
const replication = fs.readFileSync(new URL("../src/localReplication.ts", import.meta.url), "utf8");
const diagnostics = fs.readFileSync(new URL("../src/deckSyncDiagnostics.ts", import.meta.url), "utf8");
const syncedDecks = fs.readFileSync(new URL("../src/syncedDecksPage.tsx", import.meta.url), "utf8");
const router = fs.readFileSync(new URL("../src/router.tsx", import.meta.url), "utf8");
const main = fs.readFileSync(new URL("../src/main.tsx", import.meta.url), "utf8");
const serviceWorker = fs.readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
const appApi = fs.readFileSync(new URL("../src/appApi.ts", import.meta.url), "utf8");
const remoteApi = fs.readFileSync(new URL("../src/remoteApi.ts", import.meta.url), "utf8");
const authPatch = fs.readFileSync(new URL("../patches/patch-hosted-auth.py", import.meta.url), "utf8");
const reliabilityPatch = fs.readFileSync(new URL("../patches/patch-production-reliability.py", import.meta.url), "utf8");
const dockerfile = fs.readFileSync(new URL("../Dockerfile", import.meta.url), "utf8");
const app = fs.readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const appChrome = fs.readFileSync(new URL("../src/appChrome.tsx", import.meta.url), "utf8");
const dashboard = fs.readFileSync(new URL("../src/dashboardPage.tsx", import.meta.url), "utf8");
const study = fs.readFileSync(new URL("../src/studyPage.tsx", import.meta.url), "utf8");
const tools = fs.readFileSync(new URL("../src/toolsPage.tsx", import.meta.url), "utf8");
const importPipeline = fs.readFileSync(new URL("../src/importPipeline.ts", import.meta.url), "utf8");
const deckPage = fs.readFileSync(new URL("../src/deckPage.tsx", import.meta.url), "utf8");
const layoutRefine = fs.readFileSync(new URL("../src/layoutRefine.css", import.meta.url), "utf8");
const reliabilityUx = fs.readFileSync(new URL("../src/reliabilityUx.css", import.meta.url), "utf8");

test("local mutations pair entity writes with the durable outbox", () => {
  assert.match(localDb, /putDeckWithOutbox/);
  assert.match(localDb, /putNoteWithOutbox/);
  assert.match(localDb, /putCardWithOutbox/);
  assert.match(client, /putDeckWithOutbox\(deck, outbox\("create_deck"/);
  assert.match(client, /putNoteWithOutbox\(note, outbox\("create_note"/);
  assert.match(client, /putCardWithOutbox\(updated, outbox\("review"/);
});

test("portable imports are atomic locally and never auto-delete recoverable data", () => {
  assert.match(localDb, /async function putImportBatch/);
  assert.match(localDb, /database\.transaction\(\[DECKS, NOTES, OUTBOX\]/);
  assert.match(importPipeline, /putImportBatch\(deck, deckOutbox, rows\)/);
  assert.match(importPipeline, /stage: "writing-local"/);
  assert.match(importPipeline, /navigator\.onLine \? "uploading" : "attention"/);
  assert.match(importPipeline, /stage: "complete"/);
  assert.match(tools, /Writing locally/);
  assert.match(tools, /Generating cards/);
});

test("review replication preserves timestamps and idempotent conflict checks", () => {
  assert.match(replication, /reviewed_at_ms/);
  assert.match(replication, /expected_review_count/);
  assert.match(replication, /reason\.status === 409/);
});

test("normal account replication uses one snapshot per deck instead of card-detail N+1 hydration", () => {
  assert.match(remoteApi, /snapshotDeck/);
  assert.match(replication, /remoteApi\.snapshotDeck\(remoteDeck\.id\)/);
  const pull = replication.slice(replication.indexOf("async function pullSnapshot"), replication.indexOf("export async function hydrateDeckForOffline"));
  assert.doesNotMatch(pull, /remoteApi\.getCard/);
  assert.doesNotMatch(pull, /remoteApi\.previewStudy/);
  assert.match(reliabilityPatch, /\/api\/v1\/decks\/:id\/snapshot/);
});

test("online Study can use account cards before the full IndexedDB mirror exists", () => {
  assert.match(accountClient, /remoteApi\.nextStudyCard/);
  assert.match(accountClient, /remoteApi\.getCard/);
  assert.match(accountClient, /remoteApi\.previewStudy/);
  assert.match(accountClient, /remoteApi\.review/);
});

test("My nuts separates cloud state from explicit offline hydration", () => {
  assert.match(diagnostics, /localDb\.notes\(\)/);
  assert.match(diagnostics, /remoteApi\.listDecks\(\)/);
  assert.match(syncedDecks, /Local offline copy:/);
  assert.match(syncedDecks, /Account cloud:/);
  assert.match(syncedDecks, /Sync for offline/);
  assert.match(syncedDecks, /appApi\.syncDeckForOffline/);
  assert.match(replication, /hydrateDeckForOffline/);
});

test("Study exposes progress, learning counters, session completion, and undo", () => {
  assert.match(study, /data-deez="study-progress"/);
  assert.match(study, /session left/);
  assert.match(study, /learning/);
  assert.match(study, /Session complete/);
  assert.match(study, /Undo last/);
  assert.match(study, /appApi\.undoLastReview/);
  assert.match(remoteApi, /undoLastReview/);
  assert.match(reliabilityPatch, /deleteLastReview/);
});

test("review mutations tell other visible account views to refresh", () => {
  assert.match(appApi, /deez:cloud-changed/);
  assert.match(dashboard, /deez:cloud-changed/);
  assert.match(dashboard, /visibilitychange/);
  assert.match(dashboard, /last_reviewed_at_ms/);
});

test("deck management supports rename export duplicate reset and confirmed delete", () => {
  assert.match(router, /\.\/deckPage/);
  assert.match(deckPage, /Rename/);
  assert.match(deckPage, /Export \.nut/);
  assert.match(deckPage, /Duplicate/);
  assert.match(deckPage, /Reset scheduling/);
  assert.match(deckPage, /Delete deck/);
  assert.match(deckPage, /window\.confirm/);
  assert.match(appApi, /resetDeckScheduling/);
});

test("signed-in chrome keeps email out and uses route-correct full-height chrome", () => {
  assert.match(app, /useLocation/);
  assert.match(app, /location\.pathname\.startsWith\("\/app"\)/);
  assert.match(appChrome, /useLocation/);
  assert.match(appChrome, /active\(path, location\.pathname\)/);
  assert.doesNotMatch(appChrome, /const current = window\.location\.pathname/);
  assert.doesNotMatch(appChrome, /current\(\)\.email/);
  assert.match(appChrome, /data-deez="sidebar-sticky"/);
  assert.match(appChrome, /FREE/);
  assert.match(main, /reliabilityUx\.css/);
  assert.match(layoutRefine, /grid-template-rows: auto minmax\(0, 1fr\) auto/);
});

test("mobile app chrome is a first-class fixed bottom navigation", () => {
  assert.match(reliabilityUx, /@media \(max-width: 900px\)/);
  assert.match(reliabilityUx, /position: fixed !important/);
  assert.match(reliabilityUx, /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(reliabilityUx, /padding: 10px 10px 88px/);
});

test("hosted auth converges historical identities with the same verified email", () => {
  assert.match(authPatch, /findUserByEmail/);
  assert.match(authPatch, /duplicate_user_id/);
  assert.match(authPatch, /assignDeck\(canonical\.id/);
  assert.match(dockerfile, /patch-hosted-auth\.py/);
  assert.match(dockerfile, /patch-production-reliability\.py/);
});

test("Study always performs a document navigation for its route-scoped CSP", () => {
  assert.match(main, /forceStudyDocumentNavigation/);
  assert.match(main, /window\.location\.assign\(url\.href\)/);
  assert.match(main, /addEventListener\("click", forceStudyDocumentNavigation, \{ capture: true \}\)/);
});

test("service worker keeps Study policy out of the generic offline app shell", () => {
  assert.match(serviceWorker, /const CACHE_VERSION = "deez-plane-v8"/);
  assert.match(serviceWorker, /const STUDY_SHELL = "\/app\/decks\/__deez-study-shell__\/study"/);
  assert.match(serviceWorker, /if \(response\.ok && !study\)/);
  assert.match(serviceWorker, /cache\.put\("\/app", response\.clone\(\)\)/);
  assert.match(serviceWorker, /if \(study\) return \(await caches\.match\(STUDY_SHELL\)\) \|\| Response\.error\(\)/);
});
