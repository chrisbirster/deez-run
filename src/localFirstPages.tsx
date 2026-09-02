import { For, Show, createSignal } from "solid-js";
import * as stylex from "@stylexjs/stylex";
import { localDb, type LocalDeck, type OutboxItem } from "./localDb";
import { replicateNow, replicationStatus, type ReplicationStatus } from "./localReplication";
import { appStyles as s } from "./appStyles.stylex";
import { styles } from "./siteStyles";
import { Seo } from "./seo";

function message(reason: unknown) {
  return reason instanceof Error ? reason.message : "Something went wrong.";
}

export function LocalFirstStatusPage() {
  const [status, setStatus] = createSignal<ReplicationStatus>();
  const [decks, setDecks] = createSignal<LocalDeck[]>([]);
  const [outbox, setOutbox] = createSignal<OutboxItem[]>([]);
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<string>();

  async function load() {
    try {
      const [nextStatus, localDecks, pending] = await Promise.all([
        replicationStatus(),
        localDb.decks(),
        localDb.outbox(),
      ]);
      setStatus(nextStatus);
      setDecks(localDecks.filter((deck) => !deck.deleted));
      setOutbox(pending);
    } catch (reason) {
      setError(message(reason));
    }
  }
  void load();

  async function sync() {
    setBusy(true);
    setError(undefined);
    try {
      await replicateNow();
      await load();
    } catch (reason) {
      setError(message(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section {...stylex.attrs(s.main)}>
      <Seo title="Local-first Deez" description="Your local Deez database and replication status." path="/app/offline" noindex />
      <div {...stylex.attrs(s.topRow)}>
        <div>
          <p {...stylex.attrs(styles.eyebrow)}>Local first</p>
          <h1 {...stylex.attrs(s.appHeading)}>Deez lives on this device.</h1>
          <p {...stylex.attrs(s.muted)}>There is no separate offline library anymore. Synced decks are stored in IndexedDB automatically and the normal app keeps working without a connection.</p>
        </div>
        <div {...stylex.attrs(s.actions)}>
          <a {...stylex.attrs(styles.button, styles.buttonSecondary)} href="/app">My Deez</a>
          <button {...stylex.attrs(styles.button)} disabled={busy() || !navigator.onLine} onClick={() => void sync()}>{busy() ? "Syncing…" : "Sync now"}</button>
        </div>
      </div>

      <Show when={error()}>{(value) => <div {...stylex.attrs(s.error)}>{value()}</div>}</Show>
      <Show when={status()}>{(value) => (
        <div {...stylex.attrs(s.grid)}>
          <div {...stylex.attrs(s.panel)}><strong>Connection</strong><p>{value().online ? "Online" : "Offline"}</p></div>
          <div {...stylex.attrs(s.panel)}><strong>Pending changes</strong><p>{value().pending}</p></div>
          <div {...stylex.attrs(s.panel)}><strong>Conflicts</strong><p>{value().conflicts}</p></div>
          <div {...stylex.attrs(s.panel)}><strong>Last sync</strong><p>{value().last_sync_at_ms ? new Date(value().last_sync_at_ms!).toLocaleString() : "Not yet"}</p></div>
        </div>
      )}</Show>

      <section {...stylex.attrs(s.panel)} style={{ "margin-top": "18px" }}>
        <h2>Local decks</h2>
        <div {...stylex.attrs(s.list)}>
          <For each={decks()} fallback={<p {...stylex.attrs(s.muted)}>No decks are stored locally yet. Open Deez once while connected to replicate your account.</p>}>
            {(deck) => (
              <a {...stylex.attrs(s.listItem)} href={`/app/decks/${deck.id}`}>
                <div {...stylex.attrs(s.row)}><strong>{deck.name}</strong><span {...stylex.attrs(s.muted)}>{deck.dirty ? "pending sync" : "local + synced"}</span></div>
                <p {...stylex.attrs(s.muted)}>{deck.note_count} notes · {deck.card_count} cards · {deck.due_count} due</p>
              </a>
            )}
          </For>
        </div>
      </section>

      <Show when={outbox().length > 0}>
        <section {...stylex.attrs(s.panel)} style={{ "margin-top": "18px" }}>
          <h2>Replication outbox</h2>
          <p {...stylex.attrs(s.muted)}>Local mutations are durable first. They stay here until deez.run acknowledges them.</p>
          <div {...stylex.attrs(s.list)}>
            <For each={outbox()}>{(item) => (
              <div {...stylex.attrs(s.listItem)}>
                <div {...stylex.attrs(s.row)}><strong>{item.kind}</strong><span>{new Date(item.created_at_ms).toLocaleString()}</span></div>
                <p {...stylex.attrs(s.muted, s.mono)}>{item.entity_id}</p>
                <Show when={item.conflict}>{(value) => <div {...stylex.attrs(s.error)}>{value()}</div>}</Show>
              </div>
            )}</For>
          </div>
        </section>
      </Show>
    </section>
  );
}
