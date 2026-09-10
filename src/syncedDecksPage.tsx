import { For, Show, createSignal, onCleanup, type ParentProps } from "solid-js";
import * as stylex from "@stylexjs/stylex";
import { ApiError, appApi, type User } from "./appApi";
import { loadDeckSyncDiagnostics, type DeckSyncDiagnostic, type DeckSyncSnapshot, type DeckSyncState } from "./deckSyncDiagnostics";
import { replicateNow, replicationStatus } from "./localReplication";
import { appStyles as s } from "./appStyles.stylex";
import { styles } from "./siteStyles";
import { Seo } from "./seo";

const SYNC_STALE_MS = 5 * 60 * 1000;

function message(reason: unknown) {
  return reason instanceof Error ? reason.message : "Something went wrong.";
}

function SyncedShell(props: ParentProps) {
  const [user, setUser] = createSignal<User>();
  const [authError, setAuthError] = createSignal<string>();

  void appApi.me().then((value) => {
    setUser(value);
    if (!value.username) window.location.assign("/app/onboarding");
  }).catch((reason) => {
    if (reason instanceof ApiError && reason.status === 401) {
      window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname)}`);
      return;
    }
    setAuthError(message(reason));
  });

  return (
    <div {...stylex.attrs(s.appShell)}>
      <aside {...stylex.attrs(s.side)}>
        <Show when={user()} fallback={<p {...stylex.attrs(s.muted)}>Connecting…</p>}>
          {(current) => <p><strong>@{current().username ?? "new-user"}</strong><br /><span {...stylex.attrs(s.muted)}>{current().email}</span></p>}
        </Show>
        <nav {...stylex.attrs(s.sideNav)} aria-label="My Deez">
          <a {...stylex.attrs(s.sideLink)} href="/app">Today</a>
          <a {...stylex.attrs(s.sideLink)} href="/app/decks">My nuts</a>
          <a {...stylex.attrs(s.sideLink)} href="/app/offline">Offline</a>
          <a {...stylex.attrs(s.sideLink)} href="/app/settings">Settings</a>
          <a {...stylex.attrs(s.sideLink)} href="/nuts">Public nuts</a>
        </nav>
      </aside>
      <div {...stylex.attrs(s.main)}>
        <Show when={authError()}>{(value) => <div {...stylex.attrs(s.error)}>{value()}</div>}</Show>
        {props.children}
      </div>
    </div>
  );
}

function stateLabel(state: DeckSyncState) {
  switch (state) {
    case "synced": return "synced";
    case "syncing": return "syncing to this device";
    case "pending": return "pending upload";
    case "conflict": return "sync conflict";
    case "local-only": return "local only";
    case "cloud-only": return "cloud only · downloading";
    case "offline": return "offline copy";
    case "cloud-unavailable": return "cloud unavailable";
  }
}

function counts(notes: number, cards: number, due: number) {
  return `${notes} notes · ${cards} cards · ${due} due`;
}

function DeckDiagnosticRow(props: { deck: DeckSyncDiagnostic }) {
  const body = () => (
    <>
      <div {...stylex.attrs(s.row)}>
        <strong>{props.deck.name}</strong>
        <span {...stylex.attrs(s.muted)}>{stateLabel(props.deck.state)}</span>
      </div>
      <p {...stylex.attrs(s.muted)}>Local: {counts(props.deck.local.notes, props.deck.local.cards, props.deck.local.due)}</p>
      <Show when={props.deck.cloud} fallback={<p {...stylex.attrs(s.muted)}>Cloud: unavailable</p>}>
        {(cloud) => <p {...stylex.attrs(s.muted)}>Cloud: {counts(cloud().notes, cloud().cards, cloud().due)}</p>}
      </Show>
      <p {...stylex.attrs(s.muted)}>Pending: {props.deck.pending} · Conflicts: {props.deck.conflicts}</p>
    </>
  );

  return (
    <Show when={props.deck.local_id} fallback={<div {...stylex.attrs(s.listItem)}>{body()}</div>}>
      {(localId) => <a {...stylex.attrs(s.listItem)} href={`/app/decks/${localId()}`}>{body()}</a>}
    </Show>
  );
}

export function SyncedDecksPage() {
  const [snapshot, setSnapshot] = createSignal<DeckSyncSnapshot>();
  const [name, setName] = createSignal("");
  const [creating, setCreating] = createSignal(false);
  const [syncing, setSyncing] = createSignal(false);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string>();
  let activeRefresh: Promise<void> | undefined;

  function refresh(forceSync = false) {
    if (activeRefresh) return activeRefresh;
    activeRefresh = (async () => {
      setError(undefined);
      try {
        const first = await loadDeckSyncDiagnostics();
        setSnapshot(first);
        setLoading(false);

        const status = await replicationStatus();
        const stale = !status.last_sync_at_ms || Date.now() - status.last_sync_at_ms > SYNC_STALE_MS;
        const needsDownload = first.decks.some((deck) => deck.state === "syncing" || deck.state === "cloud-only");
        const needsSync = forceSync || stale || status.pending > 0 || needsDownload;
        if (!navigator.onLine || !needsSync) return;

        setSyncing(true);
        await replicateNow();
        setSnapshot(await loadDeckSyncDiagnostics());
      } catch (reason) {
        setError(message(reason));
      } finally {
        setLoading(false);
        setSyncing(false);
      }
    })().finally(() => { activeRefresh = undefined; });
    return activeRefresh;
  }

  void refresh();

  const onOnline = () => { void refresh(true); };
  const onVisible = () => {
    if (document.visibilityState === "visible") void refresh();
  };
  window.addEventListener("online", onOnline);
  document.addEventListener("visibilitychange", onVisible);
  onCleanup(() => {
    window.removeEventListener("online", onOnline);
    document.removeEventListener("visibilitychange", onVisible);
  });

  async function create(event: SubmitEvent) {
    event.preventDefault();
    setCreating(true);
    setError(undefined);
    try {
      const deck = await appApi.createDeck(name());
      setName("");
      window.location.assign(`/app/decks/${deck.id}`);
    } catch (reason) {
      setError(message(reason));
    } finally {
      setCreating(false);
    }
  }

  return (
    <SyncedShell>
      <Seo title="My nuts" description="Your local-first Deez library with cross-device sync status." path="/app/decks" noindex />
      <div {...stylex.attrs(s.topRow)}>
        <div>
          <p {...stylex.attrs(styles.eyebrow)}>Library</p>
          <h1 {...stylex.attrs(s.appHeading)}>My nuts</h1>
          <p {...stylex.attrs(s.muted)}>Local is what this browser can study now. Cloud is what deez.run has for this account.</p>
        </div>
        <button {...stylex.attrs(styles.button, styles.buttonSecondary)} disabled={syncing() || !navigator.onLine} onClick={() => void refresh(true)}>{syncing() ? "Syncing…" : "Sync now"}</button>
      </div>

      <Show when={syncing()}><div {...stylex.attrs(s.success)}>Syncing this device from deez.run. Large decks may continue filling in while the cloud totals below remain visible.</div></Show>
      <Show when={snapshot()?.cloud_error}>{(value) => <div {...stylex.attrs(s.error)}>Cloud status: {value()}</div>}</Show>
      <Show when={error()}>{(value) => <div {...stylex.attrs(s.error)}>{value()}</div>}</Show>

      <form {...stylex.attrs(s.panel)} onSubmit={create}>
        <label {...stylex.attrs(s.field)}>
          <span {...stylex.attrs(s.label)}>New deck</span>
          <input {...stylex.attrs(s.input)} value={name()} onInput={(event) => setName(event.currentTarget.value)} required maxlength="200" placeholder="SSH concepts" />
        </label>
        <button {...stylex.attrs(styles.button)} disabled={creating()}>{creating() ? "Creating…" : "Create deck"}</button>
      </form>

      <div {...stylex.attrs(s.list)}>
        <Show when={!loading()} fallback={<div {...stylex.attrs(s.panel)}>Loading your local library and cloud totals…</div>}>
          <For each={snapshot()?.decks ?? []} fallback={<div {...stylex.attrs(s.panel)}>Your library is empty. Create your first nut above.</div>}>
            {(deck) => <DeckDiagnosticRow deck={deck} />}
          </For>
        </Show>
      </div>
    </SyncedShell>
  );
}
