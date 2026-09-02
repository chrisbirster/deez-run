import { For, Show, createSignal, type ParentProps } from "solid-js";
import { useParams } from "@solidjs/router";
import * as stylex from "@stylexjs/stylex";
import { ApiError, appApi, type CardDetail, type CardSummary, type Deck, type Note, type Stats, type User } from "./appApi";
import { appStyles as s } from "./appStyles.stylex";
import {
  importPortableDeck,
  parsePortableDeck,
  portableFilename,
  serializeDeckJsonV2,
  serializeNutV2,
  type PortableNote,
} from "./portable";
import { styles } from "./siteStyles";
import { Seo } from "./seo";

function message(reason: unknown) {
  return reason instanceof Error ? reason.message : "Something went wrong.";
}

function ParityShell(props: ParentProps) {
  const [user, setUser] = createSignal<User>();
  const [authError, setAuthError] = createSignal<string>();

  void appApi.me().then((value) => {
    setUser(value);
    if (!value.username && window.location.pathname !== "/app/onboarding") window.location.assign("/app/onboarding");
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
          <a {...stylex.attrs(s.sideLink)} href="/app/tools">Tools</a>
          <a {...stylex.attrs(s.sideLink)} href="/app/settings">Settings</a>
        </nav>
      </aside>
      <div {...stylex.attrs(s.main)}>
        <Show when={authError()}>{(value) => <div {...stylex.attrs(s.error)}>{value()}</div>}</Show>
        {props.children}
      </div>
    </div>
  );
}

function download(filename: string, contents: string, mime: string) {
  const url = URL.createObjectURL(new Blob([contents], { type: `${mime};charset=utf-8` }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function when(value?: number | null) {
  if (value === undefined || value === null) return "—";
  return new Date(value).toLocaleString();
}

function generationLabel(card: CardDetail) {
  const generation = card.generation;
  return generation ? `${generation.kind}:${generation.ordinal}` : "legacy";
}

function portableNote(note: Note): PortableNote {
  return { note_type: note.note_type, fields: [...note.fields], tags: [...note.tags] };
}

async function deckNotes(deckId: string) {
  const summaries = await appApi.listNotes(deckId);
  const notes = await Promise.all(summaries.map((summary) => appApi.getNote(summary.id)));
  return notes.map(portableNote);
}

export function ToolsPage() {
  const [stats, setStats] = createSignal<Stats>();
  const [decks, setDecks] = createSignal<Deck[]>([]);
  const [file, setFile] = createSignal<File>();
  const [busy, setBusy] = createSignal(false);
  const [notice, setNotice] = createSignal<string>();
  const [error, setError] = createSignal<string>();

  async function load() {
    try {
      const [summary, library] = await Promise.all([appApi.stats(), appApi.listDecks()]);
      setStats(summary);
      setDecks(library);
    } catch (reason) {
      setError(message(reason));
    }
  }
  void load();

  async function exportDeck(deck: Deck, format: "nut" | "json") {
    setBusy(true);
    setError(undefined);
    setNotice(undefined);
    try {
      const notes = await deckNotes(deck.id);
      const contents = format === "nut"
        ? serializeNutV2(deck.name, notes)
        : serializeDeckJsonV2(deck.name, notes);
      download(
        portableFilename(deck.name, format),
        contents,
        format === "nut" ? "application/x-ndjson" : "application/json",
      );
      setNotice(`Exported ${deck.name} as ${format === "nut" ? ".nut v2" : "deez.deck JSON v2"}. Review history and scheduler state remain private to your account.`);
    } catch (reason) {
      setError(message(reason));
    } finally {
      setBusy(false);
    }
  }

  async function importDeck(event: SubmitEvent) {
    event.preventDefault();
    const selected = file();
    if (!selected) {
      setError("Choose a .nut or deez.deck JSON file first.");
      return;
    }
    setBusy(true);
    setError(undefined);
    setNotice(undefined);
    try {
      const parsed = parsePortableDeck(await selected.text(), selected.name);
      await importPortableDeck(parsed, {
        createDeck: appApi.createDeck,
        createNote: (deckId, note) => appApi.createNote(deckId, note),
        deleteDeck: appApi.deleteDeck,
      });
      setNotice(`Imported ${parsed.name} (${parsed.notes.length} logical notes, source ${parsed.source}).`);
      setFile(undefined);
      await load();
    } catch (reason) {
      setError(`${message(reason)} Partial imports are rolled back.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ParityShell>
      <Seo title="Deez tools" description="Import, export, inspect, and check synced Deez statistics." path="/app/tools" noindex />
      <div {...stylex.attrs(s.topRow)}>
        <div>
          <p {...stylex.attrs(styles.eyebrow)}>Parity tools</p>
          <h1 {...stylex.attrs(s.appHeading)}>Your Deez, portable.</h1>
        </div>
        <a {...stylex.attrs(styles.button, styles.buttonSecondary)} href="/app/offline">Prepare for offline</a>
      </div>

      <Show when={error()}>{(value) => <div {...stylex.attrs(s.error)}>{value()}</div>}</Show>
      <Show when={notice()}>{(value) => <div {...stylex.attrs(s.success)}>{value()}</div>}</Show>

      <Show when={stats()}>{(value) => (
        <div {...stylex.attrs(s.grid)}>
          <div {...stylex.attrs(s.panel)}><strong>Decks</strong><p>{value().decks}</p></div>
          <div {...stylex.attrs(s.panel)}><strong>Cards</strong><p>{value().cards}</p></div>
          <div {...stylex.attrs(s.panel)}><strong>Due now</strong><p>{value().due}</p></div>
          <div {...stylex.attrs(s.panel)}><strong>Reviews</strong><p>{value().reviews}</p></div>
        </div>
      )}</Show>

      <section {...stylex.attrs(s.panel)} style={{ "margin-top": "16px" }}>
        <h2>Import a portable deck</h2>
        <p {...stylex.attrs(s.muted)}>
          Supports native .nut v1/v2 and deez.deck JSON v1/v2. Imports are logical-content only; review history and scheduler state are never accepted from portable files.
        </p>
        <form onSubmit={importDeck}>
          <label {...stylex.attrs(s.field)}>
            <span {...stylex.attrs(s.label)}>Deck file</span>
            <input
              {...stylex.attrs(s.input)}
              type="file"
              accept=".nut,.json,application/x-ndjson,application/json"
              onChange={(event) => setFile(event.currentTarget.files?.[0])}
            />
          </label>
          <button {...stylex.attrs(styles.button)} disabled={busy()}>{busy() ? "Working…" : "Import deck"}</button>
        </form>
      </section>

      <section style={{ "margin-top": "24px" }}>
        <h2>Export or inspect</h2>
        <div {...stylex.attrs(s.list)}>
          <For each={decks()} fallback={<div {...stylex.attrs(s.panel)}>No decks yet.</div>}>
            {(deck) => (
              <div {...stylex.attrs(s.listItem)}>
                <div {...stylex.attrs(s.row)}>
                  <div>
                    <strong>{deck.name}</strong>
                    <p {...stylex.attrs(s.muted)}>{deck.note_count} notes · {deck.card_count} cards · {deck.due_count} due</p>
                  </div>
                  <div {...stylex.attrs(s.actions)}>
                    <button {...stylex.attrs(styles.button, styles.buttonSecondary)} disabled={busy()} onClick={() => void exportDeck(deck, "nut")}>Export .nut</button>
                    <button {...stylex.attrs(styles.button, styles.buttonSecondary)} disabled={busy()} onClick={() => void exportDeck(deck, "json")}>Export JSON</button>
                    <a {...stylex.attrs(styles.button, styles.buttonSecondary)} href={`/app/decks/${deck.id}/cards`}>Inspect cards</a>
                  </div>
                </div>
              </div>
            )}
          </For>
        </div>
      </section>
    </ParityShell>
  );
}

export function DeckCardsPage() {
  const params = useParams();
  const deckId = () => String(params.deckId ?? "");
  const [deck, setDeck] = createSignal<Deck>();
  const [cards, setCards] = createSignal<CardSummary[]>([]);
  const [error, setError] = createSignal<string>();

  void Promise.all([appApi.getDeck(deckId()), appApi.listCards(deckId())])
    .then(([value, list]) => {
      setDeck(value);
      setCards(list);
    })
    .catch((reason) => setError(message(reason)));

  return (
    <ParityShell>
      <Show when={error()}>{(value) => <div {...stylex.attrs(s.error)}>{value()}</div>}</Show>
      <Show when={deck()}>{(value) => (
        <>
          <div {...stylex.attrs(s.topRow)}>
            <div>
              <a href={`/app/decks/${deckId()}`}>← Deck</a>
              <h1 {...stylex.attrs(s.appHeading)}>{value().name} cards</h1>
              <p {...stylex.attrs(s.muted)}>{cards().length} generated cards</p>
            </div>
          </div>
          <div {...stylex.attrs(s.list)}>
            <For each={cards()} fallback={<div {...stylex.attrs(s.panel)}>No cards in this deck.</div>}>
              {(card) => (
                <a {...stylex.attrs(s.listItem)} href={`/app/cards/${card.id}`}>
                  <div {...stylex.attrs(s.row)}>
                    <strong>{card.front || `Card ${card.id}`}</strong>
                    <span {...stylex.attrs(s.muted)}>due {when(card.due_at_ms)}</span>
                  </div>
                  <p {...stylex.attrs(s.muted)}>
                    card {card.id}{card.note_id ? ` · note ${card.note_id}` : ""}{card.generation ? ` · ${card.generation.kind} ${card.generation.ordinal}` : ""}
                  </p>
                </a>
              )}
            </For>
          </div>
        </>
      )}</Show>
    </ParityShell>
  );
}

export function CardInspectPage() {
  const params = useParams();
  const cardId = () => String(params.cardId ?? "");
  const [card, setCard] = createSignal<CardDetail>();
  const [error, setError] = createSignal<string>();

  void appApi.getCard(cardId()).then(setCard).catch((reason) => setError(message(reason)));
  const rating = (value: number) => ["", "Again", "Hard", "Good", "Easy"][value] ?? String(value);

  return (
    <ParityShell>
      <Show when={error()}>{(value) => <div {...stylex.attrs(s.error)}>{value()}</div>}</Show>
      <Show when={card()}>{(value) => (
        <>
          <div {...stylex.attrs(s.topRow)}>
            <div>
              <a href={`/app/decks/${value().deck_id}/cards`}>← Cards</a>
              <p {...stylex.attrs(styles.eyebrow)}>Inspect</p>
              <h1 {...stylex.attrs(s.appHeading)}>Card {value().id}</h1>
            </div>
            <a {...stylex.attrs(styles.button)} href={`/app/decks/${value().deck_id}/study`}>Study deck</a>
          </div>

          <div {...stylex.attrs(s.grid)}>
            <section {...stylex.attrs(s.panel)}><h2>Front</h2><div innerHTML={value().rendered.front} /></section>
            <section {...stylex.attrs(s.panel)}><h2>Back</h2><div innerHTML={value().rendered.back} /></section>
          </div>

          <section {...stylex.attrs(s.panel)} style={{ "margin-top": "16px" }}>
            <h2>Scheduler</h2>
            <Show when={value().scheduler} fallback={<p {...stylex.attrs(s.muted)}>No scheduler state yet.</p>}>
              {(scheduler) => (
                <div>
                  <p>Due: <strong>{when(scheduler().due_at_ms)}</strong></p>
                  <p>Last reviewed: {when(scheduler().last_reviewed_at_ms)}</p>
                  <p>Stability: {scheduler().stability_days === null ? "—" : `${scheduler().stability_days?.toFixed(3)} days`}</p>
                  <p>Difficulty: {scheduler().difficulty === null ? "—" : scheduler().difficulty?.toFixed(3)}</p>
                </div>
              )}
            </Show>
            <p {...stylex.attrs(s.muted, s.mono)}>
              note={value().note_id ?? "legacy"} · type={value().note_type ?? "legacy"} · generation={generationLabel(value())}
            </p>
          </section>

          <section {...stylex.attrs(s.panel)} style={{ "margin-top": "16px" }}>
            <h2>Immutable review history</h2>
            <p {...stylex.attrs(s.muted)}>{value().review_count} total reviews. This history is the source of truth; scheduler state is derived from it.</p>
            <div {...stylex.attrs(s.list)}>
              <For each={value().reviews ?? []} fallback={<p {...stylex.attrs(s.muted)}>No reviews yet.</p>}>
                {(review, index) => (
                  <div {...stylex.attrs(s.listItem)}>
                    <div {...stylex.attrs(s.row)}><strong>#{index() + 1} {rating(review.rating)}</strong><span>{when(review.reviewed_at_ms)}</span></div>
                  </div>
                )}
              </For>
            </div>
          </section>
        </>
      )}</Show>
    </ParityShell>
  );
}
