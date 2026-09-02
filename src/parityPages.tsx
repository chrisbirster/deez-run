import { For, Show, createSignal, type ParentProps } from "solid-js";
import { useParams } from "@solidjs/router";
import * as stylex from "@stylexjs/stylex";
import { ApiError, appApi, type CardDetail, type CardSummary, type Deck, type Stats, type User } from "./appApi";
import { appStyles as s } from "./appStyles.stylex";
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

type NutDeckHeader = { kind: "deck"; format: "deez.nut"; version: 1 | 2; name: string };
type NutV1Card = { kind: "card"; question: string; answer: string };
type NutV2Note = { kind: "note"; note_type: string; fields: string[]; tags_json?: string };

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Every .nut line must be a JSON object.");
  return value as Record<string, unknown>;
}

function textField(value: unknown, name: string) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${name} must be non-empty text.`);
  return value;
}

function parseNut(source: string): { header: NutDeckHeader; records: Array<NutV1Card | NutV2Note> } {
  const lines = source.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) throw new Error("The .nut file is empty.");
  const first = object(JSON.parse(lines[0]));
  if (first.kind !== "deck" || first.format !== "deez.nut") throw new Error("The first .nut record must be a deez.nut deck header.");
  if (first.version !== 1 && first.version !== 2) throw new Error("Only .nut versions 1 and 2 are supported.");
  const header: NutDeckHeader = { kind: "deck", format: "deez.nut", version: first.version, name: textField(first.name, "Deck name") };
  const records: Array<NutV1Card | NutV2Note> = [];

  for (const line of lines.slice(1)) {
    const value = object(JSON.parse(line));
    if (header.version === 1) {
      if (value.kind !== "card") throw new Error("A .nut v1 deck may only contain card records after the header.");
      records.push({ kind: "card", question: textField(value.question, "Question"), answer: textField(value.answer, "Answer") });
      continue;
    }
    if (value.kind !== "note") throw new Error("A .nut v2 deck may only contain note records after the header.");
    if (typeof value.note_type !== "string" || !value.note_type) throw new Error("note_type is required.");
    if (!Array.isArray(value.fields) || value.fields.some((field) => typeof field !== "string")) throw new Error("Note fields must be an array of strings.");
    if (value.tags_json !== undefined && typeof value.tags_json !== "string") throw new Error("tags_json must be a JSON string.");
    records.push({ kind: "note", note_type: value.note_type, fields: value.fields as string[], tags_json: value.tags_json as string | undefined });
  }
  return { header, records };
}

function tagsFromJson(value?: string): string[] {
  if (!value) return [];
  const parsed = JSON.parse(value) as unknown;
  if (!Array.isArray(parsed) || parsed.some((tag) => typeof tag !== "string")) throw new Error("tags_json must encode an array of strings.");
  return parsed as string[];
}

function safeFilename(name: string) {
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return `${slug || "deez-deck"}.nut`;
}

function download(filename: string, contents: string) {
  const url = URL.createObjectURL(new Blob([contents], { type: "application/x-ndjson;charset=utf-8" }));
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
      setStats(summary); setDecks(library);
    } catch (reason) { setError(message(reason)); }
  }
  void load();

  async function exportNut(deck: Deck) {
    setBusy(true); setError(undefined); setNotice(undefined);
    try {
      const summaries = await appApi.listNotes(deck.id);
      const notes = await Promise.all(summaries.map((summary) => appApi.getNote(summary.id)));
      const lines = [JSON.stringify({ kind: "deck", format: "deez.nut", version: 2, name: deck.name })];
      for (const note of notes) lines.push(JSON.stringify({ kind: "note", note_type: note.note_type, fields: note.fields, tags_json: JSON.stringify(note.tags) }));
      download(safeFilename(deck.name), `${lines.join("\n")}\n`);
      setNotice(`Exported ${deck.name} as .nut v2. Review history stays in your Deez account and is not included.`);
    } catch (reason) { setError(message(reason)); }
    finally { setBusy(false); }
  }

  async function importNut(event: SubmitEvent) {
    event.preventDefault();
    const selected = file();
    if (!selected) { setError("Choose a .nut file first."); return; }
    setBusy(true); setError(undefined); setNotice(undefined);
    let createdDeck: Deck | undefined;
    try {
      const parsed = parseNut(await selected.text());
      createdDeck = await appApi.createDeck(parsed.header.name);
      for (const record of parsed.records) {
        if (record.kind === "card") {
          await appApi.createNote(createdDeck.id, { note_type: "basic", fields: [record.question, record.answer], tags: [] });
        } else {
          await appApi.createNote(createdDeck.id, { note_type: record.note_type, fields: record.fields, tags: tagsFromJson(record.tags_json) });
        }
      }
      setNotice(`Imported ${parsed.header.name} (${parsed.records.length} logical ${parsed.header.version === 1 ? "cards" : "notes"}).`);
      setFile(undefined);
      await load();
    } catch (reason) {
      if (createdDeck) await appApi.deleteDeck(createdDeck.id).catch(() => undefined);
      setError(`${message(reason)}${createdDeck ? " The partial deck was rolled back." : ""}`);
    } finally { setBusy(false); }
  }

  return <ParityShell>
    <Seo title="Deez tools" description="Import, export, inspect, and check synced Deez statistics." path="/app/tools" noindex />
    <div {...stylex.attrs(s.topRow)}><div><p {...stylex.attrs(styles.eyebrow)}>Parity tools</p><h1 {...stylex.attrs(s.appHeading)}>Your Deez, portable.</h1></div><a {...stylex.attrs(styles.button, styles.buttonSecondary)} href="/app/offline">Prepare for offline</a></div>
    <Show when={error()}>{(value) => <div {...stylex.attrs(s.error)}>{value()}</div>}</Show>
    <Show when={notice()}>{(value) => <div {...stylex.attrs(s.success)}>{value()}</div>}</Show>
    <Show when={stats()}>{(value) => <div {...stylex.attrs(s.grid)}>
      <div {...stylex.attrs(s.panel)}><strong>Decks</strong><p>{value().decks}</p></div>
      <div {...stylex.attrs(s.panel)}><strong>Cards</strong><p>{value().cards}</p></div>
      <div {...stylex.attrs(s.panel)}><strong>Due now</strong><p>{value().due}</p></div>
      <div {...stylex.attrs(s.panel)}><strong>Reviews</strong><p>{value().reviews}</p></div>
    </div>}</Show>
    <section {...stylex.attrs(s.panel)} style={{ "margin-top": "16px" }}>
      <h2>Import a .nut deck</h2>
      <p {...stylex.attrs(s.muted)}>Supports native logical-note .nut v2 and legacy card-only .nut v1. Import is content-only; scheduler/review state is never smuggled in.</p>
      <form onSubmit={importNut}><label {...stylex.attrs(s.field)}><span {...stylex.attrs(s.label)}>.nut file</span><input {...stylex.attrs(s.input)} type="file" accept=".nut,application/x-ndjson,application/json" onChange={(event) => setFile(event.currentTarget.files?.[0])} /></label><button {...stylex.attrs(styles.button)} disabled={busy()}>{busy() ? "Working…" : "Import deck"}</button></form>
    </section>
    <section style={{ "margin-top": "24px" }}><h2>Export or inspect</h2><div {...stylex.attrs(s.list)}><For each={decks()} fallback={<div {...stylex.attrs(s.panel)}>No decks yet.</div>}>{(deck) => <div {...stylex.attrs(s.listItem)}><div {...stylex.attrs(s.row)}><div><strong>{deck.name}</strong><p {...stylex.attrs(s.muted)}>{deck.note_count} notes · {deck.card_count} cards · {deck.due_count} due</p></div><div {...stylex.attrs(s.actions)}><button {...stylex.attrs(styles.button, styles.buttonSecondary)} disabled={busy()} onClick={() => void exportNut(deck)}>Export .nut</button><a {...stylex.attrs(styles.button, styles.buttonSecondary)} href={`/app/decks/${deck.id}/cards`}>Inspect cards</a></div></div></div>}</For></div></section>
  </ParityShell>;
}

export function DeckCardsPage() {
  const params = useParams();
  const deckId = () => String(params.deckId ?? "");
  const [deck, setDeck] = createSignal<Deck>();
  const [cards, setCards] = createSignal<CardSummary[]>([]);
  const [error, setError] = createSignal<string>();
  void Promise.all([appApi.getDeck(deckId()), appApi.listCards(deckId())]).then(([value, list]) => { setDeck(value); setCards(list); }).catch((reason) => setError(message(reason)));
  return <ParityShell><Show when={error()}>{(value) => <div {...stylex.attrs(s.error)}>{value()}</div>}</Show><Show when={deck()}>{(value) => <><div {...stylex.attrs(s.topRow)}><div><a href={`/app/decks/${deckId()}`}>← Deck</a><h1 {...stylex.attrs(s.appHeading)}>{value().name} cards</h1><p {...stylex.attrs(s.muted)}>{cards().length} generated cards</p></div></div><div {...stylex.attrs(s.list)}><For each={cards()} fallback={<div {...stylex.attrs(s.panel)}>No cards in this deck.</div>}>{(card) => <a {...stylex.attrs(s.listItem)} href={`/app/cards/${card.id}`}><div {...stylex.attrs(s.row)}><strong>{card.front || `Card ${card.id}`}</strong><span {...stylex.attrs(s.muted)}>due {when(card.due_at_ms)}</span></div><p {...stylex.attrs(s.muted)}>card {card.id}{card.note_id ? ` · note ${card.note_id}` : ""}{card.generation ? ` · ${card.generation.kind} ${card.generation.ordinal}` : ""}</p></a>}</For></div></>}</Show></ParityShell>;
}

export function CardInspectPage() {
  const params = useParams();
  const cardId = () => String(params.cardId ?? "");
  const [card, setCard] = createSignal<CardDetail>();
  const [error, setError] = createSignal<string>();
  void appApi.getCard(cardId()).then(setCard).catch((reason) => setError(message(reason)));
  const rating = (value: number) => ["", "Again", "Hard", "Good", "Easy"][value] ?? String(value);
  return <ParityShell><Show when={error()}>{(value) => <div {...stylex.attrs(s.error)}>{value()}</div>}</Show><Show when={card()}>{(value) => <><div {...stylex.attrs(s.topRow)}><div><a href={`/app/decks/${value().deck_id}/cards`}>← Cards</a><p {...stylex.attrs(styles.eyebrow)}>Inspect</p><h1 {...stylex.attrs(s.appHeading)}>Card {value().id}</h1></div><a {...stylex.attrs(styles.button)} href={`/app/decks/${value().deck_id}/study`}>Study deck</a></div><div {...stylex.attrs(s.grid)}><section {...stylex.attrs(s.panel)}><h2>Front</h2><div>{value().rendered.front}</div></section><section {...stylex.attrs(s.panel)}><h2>Back</h2><div>{value().rendered.back}</div></section></div><section {...stylex.attrs(s.panel)} style={{ "margin-top": "16px" }}><h2>Scheduler</h2><Show when={value().scheduler} fallback={<p {...stylex.attrs(s.muted)}>No scheduler state yet.</p>}>{(scheduler) => <div><p>Due: <strong>{when(scheduler().due_at_ms)}</strong></p><p>Last reviewed: {when(scheduler().last_reviewed_at_ms)}</p><p>Stability: {scheduler().stability_days === null ? "—" : `${scheduler().stability_days?.toFixed(3)} days`}</p><p>Difficulty: {scheduler().difficulty === null ? "—" : scheduler().difficulty?.toFixed(3)}</p></div>}</Show><p {...stylex.attrs(s.muted, s.mono)}>note={value().note_id ?? "legacy"} · type={value().note_type ?? "legacy"} · reviews={value().review_count}</p></section><section {...stylex.attrs(s.panel)} style={{ "margin-top": "16px" }}><h2>Immutable review history</h2><div {...stylex.attrs(s.list)}><For each={value().reviews ?? []} fallback={<p {...stylex.attrs(s.muted)}>No reviews yet.</p>}>{(review, index) => <div {...stylex.attrs(s.listItem)}><div {...stylex.attrs(s.row)}><strong>#{index() + 1} · {rating(review.rating)}</strong><span>{when(review.reviewed_at_ms)}</span></div></div>}</For></div></section></>}</Show></ParityShell>;
}
