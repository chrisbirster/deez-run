import { For, Show, createSignal } from "solid-js";
import * as stylex from "@stylexjs/stylex";
import { loadDeckSyncDiagnostics, type DeckSyncSnapshot, type DeckSyncState } from "./deckSyncDiagnostics";
import { replicateNow, replicationStatus, type ReplicationStatus } from "./localReplication";
import { appStyles as s } from "./appStyles.stylex";
import { styles } from "./siteStyles";
import { Seo } from "./seo";

function message(reason: unknown) {
  return reason instanceof Error ? reason.message : "Something went wrong.";
}

function stateLabel(state: DeckSyncState) {
  switch (state) {
    case "synced": return "synced";
    case "syncing": return "local differs from cloud";
    case "pending": return "pending upload";
    case "conflict": return "conflict";
    case "local-only": return "local only";
    case "cloud-only": return "cloud only";
    case "offline": return "offline copy";
    case "cloud-unavailable": return "cloud unavailable";
  }
}

function counts(notes: number, cards: number, due: number) {
  return `${notes} notes · ${cards} cards · ${due} due`;
}

export function LocalFirstStatusPage() {
  const [status, setStatus] = createSignal<ReplicationStatus>();
  const [snapshot, setSnapshot] = createSignal<DeckSyncSnapshot>();
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<string>();

  async function load() {
    try {
      const [nextStatus, nextSnapshot] = await Promise.all([
        replicationStatus(),
        loadDeckSyncDiagnostics(),
      ]);
      setStatus(nextStatus);
      setSnapshot(nextSnapshot);
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
          <p {...stylex.attrs(s.muted)}>Local counts are the notes and cards actually stored in this browser. Cloud counts are what deez.run has for the signed-in account.</p>
        </div>
        <div {...stylex.attrs(s.actions)}>
          <a {...stylex.attrs(styles.button, styles.buttonSecondary)} href="/app">My Deez</a>
          <button {...stylex.attrs(styles.button)} disabled={busy() || !navigator.onLine} onClick={() => void sync()}>{busy() ? "Syncing…" : "Sync now"}</button>
        </div>
      </div>

      <Show when={error()}>{(value) => <div {...stylex.attrs(s.error)}>{value()}</div>}</Show>
      <Show when={snapshot()?.cloud_error}>{(value) => <div {...stylex.attrs(s.error)}>Cloud status: {value()}</div>}</Show>
      <Show when={status()}>{(value) => (
        <div {...stylex.attrs(s.grid)}>
          <div {...stylex.attrs(s.panel)}><strong>Connection</strong><p>{value().online ? "Online" : "Offline"}</p></div>
          <div {...stylex.attrs(s.panel)}><strong>Pending changes</strong><p>{value().pending}</p></div>
          <div {...stylex.attrs(s.panel)}><strong>Conflicts</strong><p>{value().conflicts}</p></div>
          <div {...stylex.attrs(s.panel)}><strong>Last sync</strong><p>{value().last_sync_at_ms ? new Date(value().last_sync_at_ms!).toLocaleString() : "Not yet"}</p></div>
        </div>
      )}</Show>

      <section {...stylex.attrs(s.panel)} style={{ "margin-top": "18px" }}>
        <h2>Deck diagnostics</h2>
        <div {...stylex.attrs(s.list)}>
          <For each={snapshot()?.decks ?? []} fallback={<p {...stylex.attrs(s.muted)}>No decks are stored locally or visible in the cloud yet.</p>}>
            {(deck) => (
              <div {...stylex.attrs(s.listItem)}>
                <div {...stylex.attrs(s.row)}><strong>{deck.name}</strong><span {...stylex.attrs(s.muted)}>{stateLabel(deck.state)}</span></div>
                <p {...stylex.attrs(s.muted)}>Local: {counts(deck.local.notes, deck.local.cards, deck.local.due)}</p>
                <Show when={deck.cloud} fallback={<p {...stylex.attrs(s.muted)}>Cloud: unavailable</p>}>
                  {(cloud) => <p {...stylex.attrs(s.muted)}>Cloud: {counts(cloud().notes, cloud().cards, cloud().due)}</p>}
                </Show>
                <p {...stylex.attrs(s.muted)}>Pending: {deck.pending} · Conflicts: {deck.conflicts}</p>
              </div>
            )}
          </For>
        </div>
      </section>

      <Show when={(snapshot()?.outbox.length ?? 0) > 0}>
        <section {...stylex.attrs(s.panel)} style={{ "margin-top": "18px" }}>
          <h2>Replication outbox</h2>
          <p {...stylex.attrs(s.muted)}>Local mutations are durable first. They stay here until deez.run acknowledges them.</p>
          <div {...stylex.attrs(s.list)}>
            <For each={snapshot()?.outbox ?? []}>{(item) => (
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
