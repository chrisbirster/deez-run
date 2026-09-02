import { For, Show, createSignal } from "solid-js";
import { useParams } from "@solidjs/router";
import * as stylex from "@stylexjs/stylex";
import { appApi, type Deck } from "./appApi";
import {
  flushOfflineReviews,
  listOfflineDecks,
  nextOfflineCard,
  offlineDeck,
  prepareDeckOffline,
  queueOfflineReview,
  queuedReviews,
  type OfflineDeck,
} from "./offline";
import { appStyles as s } from "./appStyles.stylex";
import { styles } from "./siteStyles";
import { Seo } from "./seo";

function message(reason: unknown) {
  return reason instanceof Error ? reason.message : "Something went wrong.";
}

function OfflineShell(props: { children: unknown }) {
  return (
    <div {...stylex.attrs(s.main)}>
      <nav {...stylex.attrs(s.actions)} aria-label="Offline Deez">
        <a {...stylex.attrs(styles.button, styles.buttonSecondary)} href="/app">My Deez</a>
        <a {...stylex.attrs(styles.button, styles.buttonSecondary)} href="/app/offline">Offline</a>
      </nav>
      {props.children as never}
    </div>
  );
}

export function OfflineLibraryPage() {
  const [onlineDecks, setOnlineDecks] = createSignal<Deck[]>([]);
  const [cached, setCached] = createSignal<OfflineDeck[]>([]);
  const [pending, setPending] = createSignal(0);
  const [progress, setProgress] = createSignal<string>();
  const [error, setError] = createSignal<string>();
  const [busyId, setBusyId] = createSignal<string>();

  async function load() {
    try {
      const local = await listOfflineDecks();
      setCached(local);
      setPending((await queuedReviews()).length);
      if (navigator.onLine) {
        try {
          await flushOfflineReviews();
          setPending((await queuedReviews()).length);
          setOnlineDecks(await appApi.listDecks());
        } catch (reason) {
          setError(message(reason));
        }
      }
    } catch (reason) {
      setError(message(reason));
    }
  }
  void load();

  async function download(deck: Deck) {
    setBusyId(deck.id);
    setError(undefined);
    setProgress(`Preparing ${deck.name}…`);
    try {
      await prepareDeckOffline(deck.id, (done, total) => setProgress(`Downloading ${deck.name}: ${done}/${total} cards`));
      setCached(await listOfflineDecks());
      setProgress(`${deck.name} is ready offline.`);
    } catch (reason) {
      setError(message(reason));
      setProgress(undefined);
    } finally {
      setBusyId(undefined);
    }
  }

  const cachedIds = () => new Set(cached().map((deck) => deck.id));

  return (
    <OfflineShell>
      <Seo title="Offline Deez" description="Download Deez decks for offline study." path="/app/offline" noindex />
      <div {...stylex.attrs(s.topRow)}>
        <div>
          <p {...stylex.attrs(styles.eyebrow)}>Plane mode</p>
          <h1 {...stylex.attrs(s.appHeading)}>Offline Deez</h1>
          <p {...stylex.attrs(s.muted)}>{navigator.onLine ? "Online — downloads and queued reviews can sync." : "Offline — using the decks stored on this device."}</p>
        </div>
      </div>

      <Show when={error()}>{(value) => <div {...stylex.attrs(s.error)}>{value()}</div>}</Show>
      <Show when={progress()}>{(value) => <div {...stylex.attrs(s.success)}>{value()}</div>}</Show>
      <Show when={pending() > 0}><div {...stylex.attrs(s.panel)}><strong>{pending()} review{pending() === 1 ? "" : "s"} waiting to sync.</strong><p {...stylex.attrs(s.muted)}>They keep their original review time and replay automatically when connectivity returns.</p></div></Show>

      <section {...stylex.attrs(s.panel)}>
        <h2>Ready on this device</h2>
        <div {...stylex.attrs(s.list)}>
          <For each={cached()} fallback={<p {...stylex.attrs(s.muted)}>No decks downloaded yet. While connected, download the decks you want before boarding.</p>}>
            {(entry) => <a {...stylex.attrs(s.listItem)} href={`/app/offline/${entry.id}`}><strong>{entry.deck.name}</strong><p {...stylex.attrs(s.muted)}>{entry.cards.length} cached cards · downloaded {new Date(entry.downloadedAtMs).toLocaleString()}</p></a>}
          </For>
        </div>
      </section>

      <Show when={navigator.onLine}>
        <section {...stylex.attrs(s.panel)}>
          <h2>Download for offline study</h2>
          <div {...stylex.attrs(s.list)}>
            <For each={onlineDecks()} fallback={<p {...stylex.attrs(s.muted)}>Sign in and create a deck first, then return here.</p>}>
              {(deck) => <div {...stylex.attrs(s.listItem)}><div {...stylex.attrs(s.row)}><div><strong>{deck.name}</strong><p {...stylex.attrs(s.muted)}>{deck.card_count} cards · {deck.due_count} due</p></div><button {...stylex.attrs(styles.button, styles.buttonSecondary)} disabled={busyId() === deck.id} onClick={() => void download(deck)}>{busyId() === deck.id ? "Downloading…" : cachedIds().has(deck.id) ? "Refresh offline copy" : "Download"}</button></div></div>}
            </For>
          </div>
        </section>
      </Show>

      <section {...stylex.attrs(s.panel)}>
        <h2>Before boarding</h2>
        <p {...stylex.attrs(s.muted)}>Open this page once after downloading your decks, then use your browser’s “Add to Home Screen” option. Deez caches the application shell, deck cards, study previews, and referenced media on this device.</p>
      </section>
    </OfflineShell>
  );
}

export function OfflineStudyPage() {
  const params = useParams();
  const deckId = () => String(params.deckId ?? "");
  const [deck, setDeck] = createSignal<OfflineDeck>();
  const [current, setCurrent] = createSignal<Awaited<ReturnType<typeof nextOfflineCard>>>();
  const [revealed, setRevealed] = createSignal(false);
  const [done, setDone] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<string>();
  const [pending, setPending] = createSignal(0);

  async function next() {
    setRevealed(false);
    setError(undefined);
    try {
      const local = await offlineDeck(deckId());
      if (!local) {
        setError("This deck is not downloaded on this device. Connect to the internet and prepare it from Offline Deez first.");
        return;
      }
      setDeck(local);
      setPending((await queuedReviews()).filter((item) => item.deckId === deckId()).length);
      const card = await nextOfflineCard(deckId());
      setCurrent(card);
      setDone(!card);
    } catch (reason) {
      setError(message(reason));
    }
  }
  void next();

  async function rate(rating: 1 | 2 | 3 | 4) {
    const card = current();
    if (!card) return;
    setBusy(true);
    setError(undefined);
    try {
      await queueOfflineReview(deckId(), card.detail.id, rating);
      if (navigator.onLine) await flushOfflineReviews();
      await next();
    } catch (reason) {
      setError(message(reason));
    } finally {
      setBusy(false);
    }
  }

  const labels: Array<[1 | 2 | 3 | 4, "again" | "hard" | "good" | "easy", string]> = [[1, "again", "Again"], [2, "hard", "Hard"], [3, "good", "Good"], [4, "easy", "Easy"]];

  return (
    <OfflineShell>
      <div {...stylex.attrs(s.topRow)}><div><a href="/app/offline">← Offline decks</a><h1 {...stylex.attrs(s.appHeading)}>{deck()?.deck.name ?? "Offline study"}</h1><p {...stylex.attrs(s.muted)}>{navigator.onLine ? "Connected" : "Plane mode"} · {pending()} queued review{pending() === 1 ? "" : "s"}</p></div></div>
      <Show when={error()}>{(value) => <div {...stylex.attrs(s.error)}>{value()}</div>}</Show>
      <Show when={done()} fallback={
        <Show when={current()}>{(card) => <>
          <section {...stylex.attrs(s.studyCard)}>
            <div {...stylex.attrs(s.studyFace)} innerHTML={revealed() ? card().detail.rendered.back : card().detail.rendered.front} />
            <Show when={!revealed()}><button {...stylex.attrs(styles.button)} onClick={() => setRevealed(true)}>Show answer</button></Show>
          </section>
          <Show when={revealed()}><div {...stylex.attrs(s.ratingGrid)}><For each={labels}>{([rating, key, label]) => <button {...stylex.attrs(styles.button, styles.buttonSecondary)} disabled={busy()} onClick={() => void rate(rating)}><span>{label}</span>&nbsp;<small>{card().preview.schedule[key].interval_days.toFixed(1)}d</small></button>}</For></div></Show>
        </>}</Show>
      }>
        <div {...stylex.attrs(s.panel)}><h2>Offline queue complete.</h2><p {...stylex.attrs(s.muted)}>There are no more currently-due cached cards that are safe to rate before synchronization. Reviews already made offline remain on this device until they reach deez.run.</p><a {...stylex.attrs(styles.button)} href="/app/offline">Offline library</a></div>
      </Show>
    </OfflineShell>
  );
}
