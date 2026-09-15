import { For, Show, createSignal, onCleanup } from "solid-js";
import * as stylex from "@stylexjs/stylex";
import { appApi } from "./appApi";
import { AppShell } from "./appChrome";
import { loadDeckSyncDiagnostics, type DeckSyncDiagnostic, type DeckSyncSnapshot, type DeckSyncState } from "./deckSyncDiagnostics";
import { appStyles as s } from "./appStyles.stylex";
import { styles } from "./siteStyles";
import { Seo } from "./seo";

function message(reason: unknown) { return reason instanceof Error ? reason.message : "Something went wrong."; }
function stateLabel(state: DeckSyncState) {
  switch (state) {
    case "synced": return "offline copy current";
    case "syncing": return "cloud/local differ";
    case "pending": return "pending upload";
    case "conflict": return "sync conflict";
    case "local-only": return "local only";
    case "cloud-only": return "in your cloud account";
    case "offline": return "offline copy";
    case "cloud-unavailable": return "cloud unavailable";
  }
}
function counts(notes: number, cards: number, due: number) { return `${notes} notes · ${cards} cards · ${due} due`; }

function DeckDiagnosticRow(props: { deck: DeckSyncDiagnostic }) {
  const body = () => <>
    <div {...stylex.attrs(s.row)}><strong>{props.deck.name}</strong><span {...stylex.attrs(s.muted)}>{stateLabel(props.deck.state)}</span></div>
    <p {...stylex.attrs(s.muted)}>Local offline copy: {counts(props.deck.local.notes, props.deck.local.cards, props.deck.local.due)}</p>
    <Show when={props.deck.cloud} fallback={<p {...stylex.attrs(s.muted)}>Account cloud: unavailable</p>}>
      {(cloud) => <p {...stylex.attrs(s.muted)}>Account cloud: {counts(cloud().notes, cloud().cards, cloud().due)}</p>}
    </Show>
    <p {...stylex.attrs(s.muted)}>Pending: {props.deck.pending} · Conflicts: {props.deck.conflicts}</p>
  </>;
  return <Show when={props.deck.local_id ?? props.deck.cloud_id} fallback={<div {...stylex.attrs(s.listItem)}>{body()}</div>}>
    {(deckId) => <a {...stylex.attrs(s.listItem)} href={`/app/decks/${deckId()}`}>{body()}</a>}
  </Show>;
}

export function SyncedDecksPage() {
  const [snapshot, setSnapshot] = createSignal<DeckSyncSnapshot>();
  const [name, setName] = createSignal("");
  const [creating, setCreating] = createSignal(false);
  const [syncing, setSyncing] = createSignal(false);
  const [syncText, setSyncText] = createSignal("");
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string>();
  let activeRefresh: Promise<void> | undefined;

  function refresh() {
    if (activeRefresh) return activeRefresh;
    activeRefresh = (async () => {
      setError(undefined);
      try { setSnapshot(await loadDeckSyncDiagnostics()); }
      catch (reason) { setError(message(reason)); }
      finally { setLoading(false); }
    })().finally(() => { activeRefresh = undefined; });
    return activeRefresh;
  }
  void refresh();

  async function syncOffline() {
    if (!navigator.onLine || syncing()) return;
    setSyncing(true); setError(undefined);
    try {
      const library = await appApi.listDecks();
      for (let deckIndex = 0; deckIndex < library.length; deckIndex += 1) {
        const deck = library[deckIndex];
        setSyncText(`${deckIndex + 1}/${library.length} ${deck.name}: preparing snapshot…`);
        await appApi.syncDeckForOffline(deck.id, (progress) => {
          setSyncText(`${deckIndex + 1}/${library.length} ${deck.name}: ${progress.hydrated_cards}/${progress.total_cards} cards ready offline`);
        });
      }
      setSyncText("Offline library is current.");
      await refresh();
    } catch (reason) { setError(message(reason)); }
    finally { setSyncing(false); }
  }

  const onOnline = () => { void refresh(); };
  const onVisible = () => { if (document.visibilityState === "visible") void refresh(); };
  const onChanged = () => { void refresh(); };
  window.addEventListener("online", onOnline);
  window.addEventListener("deez:cloud-changed", onChanged);
  document.addEventListener("visibilitychange", onVisible);
  onCleanup(() => {
    window.removeEventListener("online", onOnline);
    window.removeEventListener("deez:cloud-changed", onChanged);
    document.removeEventListener("visibilitychange", onVisible);
  });

  async function create(event: SubmitEvent) {
    event.preventDefault(); setCreating(true); setError(undefined);
    try { const deck = await appApi.createDeck(name()); setName(""); window.location.assign(`/app/decks/${deck.id}`); }
    catch (reason) { setError(message(reason)); }
    finally { setCreating(false); }
  }

  return <AppShell>
    <Seo title="My nuts" description="Your Deez account library and optional offline copies." path="/app/decks" noindex />
    <div {...stylex.attrs(s.topRow)}>
      <div><p {...stylex.attrs(styles.eyebrow)}>Library</p><h1 {...stylex.attrs(s.appHeading)}>My nuts</h1><p {...stylex.attrs(s.muted)}>Account cloud is shared across devices. Offline copies are optional per-device caches.</p></div>
      <button {...stylex.attrs(styles.button, styles.buttonSecondary)} disabled={syncing() || !navigator.onLine} onClick={() => void syncOffline()}>{syncing() ? "Syncing offline…" : "Sync for offline"}</button>
    </div>
    <Show when={syncText()}><div {...stylex.attrs(s.success)}>{syncText()}</div></Show>
    <Show when={snapshot()?.cloud_error}>{(value) => <div {...stylex.attrs(s.error)}>Cloud status: {value()}</div>}</Show>
    <Show when={error()}>{(value) => <div {...stylex.attrs(s.error)}>{value()}</div>}</Show>
    <form {...stylex.attrs(s.panel)} onSubmit={create}>
      <label {...stylex.attrs(s.field)}><span {...stylex.attrs(s.label)}>New deck</span><input {...stylex.attrs(s.input)} value={name()} onInput={(event) => setName(event.currentTarget.value)} required maxlength="200" placeholder="SSH concepts" /></label>
      <button {...stylex.attrs(styles.button)} disabled={creating()}>{creating() ? "Creating…" : "Create deck"}</button>
    </form>
    <div {...stylex.attrs(s.list)}>
      <Show when={!loading()} fallback={<div {...stylex.attrs(s.panel)}>Loading your account library…</div>}>
        <For each={snapshot()?.decks ?? []} fallback={<div {...stylex.attrs(s.panel)}>Your library is empty. Create your first nut above.</div>}>
          {(deck) => <DeckDiagnosticRow deck={deck} />}
        </For>
      </Show>
    </div>
  </AppShell>;
}
