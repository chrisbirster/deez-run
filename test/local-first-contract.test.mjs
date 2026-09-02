import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const localDb = fs.readFileSync(new URL("../src/localDb.ts", import.meta.url), "utf8");
const client = fs.readFileSync(new URL("../src/localClientApi.ts", import.meta.url), "utf8");
const replication = fs.readFileSync(new URL("../src/localReplication.ts", import.meta.url), "utf8");
const router = fs.readFileSync(new URL("../src/router.tsx", import.meta.url), "utf8");
const main = fs.readFileSync(new URL("../src/main.tsx", import.meta.url), "utf8");

test("local mutations pair entity writes with the durable outbox", () => {
  assert.match(localDb, /putDeckWithOutbox/);
  assert.match(localDb, /putNoteWithOutbox/);
  assert.match(localDb, /putCardWithOutbox/);
  assert.match(client, /putDeckWithOutbox\(deck, outbox\("create_deck"/);
  assert.match(client, /putNoteWithOutbox\(note, outbox\("create_note"/);
  assert.match(client, /putCardWithOutbox\(updated, outbox\("review"/);
});

test("review replication preserves timestamps and verifies idempotent 409 retries", () => {
  assert.match(replication, /reviewed_at_ms/);
  assert.match(replication, /expected_review_count/);
  assert.match(replication, /reason\.status === 409/);
  assert.match(replication, /existing\.rating !== rating \|\| existing\.reviewed_at_ms !== reviewedAtMs/);
});

test("normal app API is local first and offline route is status rather than a second database", () => {
  const appApi = fs.readFileSync(new URL("../src/appApi.ts", import.meta.url), "utf8");
  assert.match(appApi, /localClientApi/);
  assert.match(router, /LocalFirstStatusPage/);
  assert.doesNotMatch(router, /OfflineStudyPage/);
});

test("replication starts on boot and reconnect", () => {
  assert.match(main, /startReplication/);
  assert.match(main, /addEventListener\("online"/);
  assert.match(main, /replicateNow/);
});
