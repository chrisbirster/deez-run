import { For, Show, createSignal } from "solid-js";
import { useNavigate, useParams } from "@solidjs/router";
import * as stylex from "@stylexjs/stylex";
import { appApi, type Deck, type NoteSummary } from "./appApi";
import { AppShell } from "./appChrome";
import { appStyles as s } from "./appStyles.stylex";
import { importPortableDeckAtomic } from "./importPipeline";
import { portableFilename, serializeNutV2, type PortableDeck } from "./portable";
import { Seo } from "./seo";
import { styles } from "./siteStyles";

function message(reason: unknown) { return reason instanceof Error ? reason.message : "Something went wrong."; }
function download(filename: string, contents: string) {
  const url = URL.createObjectURL(new Blob([contents], { type: "application/x-ndjson;charset=utf-8" }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; document.body.append(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
}

export function DeckPage() {
  const params = useParams();
  const navigate = useNavigate();
  const id = () => String(params.deckId ?? "");
  const [deck, setDeck] = createSignal<Deck>();
  const [notes, setNotes] = createSignal<NoteSummary[]>([]);
  const [rename, setRename] = createSignal("");
  const [busy, setBusy] = createSignal<string>();
  const [error, setError] = createSignal<string>();
  const [notice, setNotice] = createSignal<string>();

  async function load() {
    try {
      const [d, n] = await Promise.all([appApi.getDeck(id()), appApi.listNotes(id())]);
      setDeck(d); setRename(d.name); setNotes(n);
    } catch (reason) { setError(message(reason)); }
  }
  void load();

  async function renameDeck(event: SubmitEvent) {
    event.preventDefault(); setBusy("rename"); setError(undefined);
    try { const updated = await appApi.renameDeck(id(), rename()); setDeck(updated); setNotice("Deck renamed."); }
    catch (reason) { setError(message(reason)); }
    finally { setBusy(undefined); }
  }

  async function exportNut() {
    setBusy("export"); setError(undefined);
    try {
      const snapshot = await appApi.snapshotDeck(id());
      const portable = snapshot.notes.map((note) => ({ note_type: note.note_type, fields: [...note.fields], tags: [...note.tags] }));
      download(portableFilename(snapshot.deck.name, "nut"), serializeNutV2(snapshot.deck.name, portable));
      setNotice("Exported a portable .nut backup.");
    } catch (reason) { setError(message(reason)); }
    finally { setBusy(undefined); }
  }

  async function duplicate() {
    const current = deck(); if (!current) return;
    setBusy("duplicate"); setError(undefined);
    try {
      const snapshot = await appApi.snapshotDeck(id());
      const parsed: PortableDeck = {
        name: `${snapshot.deck.name} copy`, source: "nut-v2",
        notes: snapshot.notes.map((note) => ({ note_type: note.note_type, fields: [...note.fields], tags: [...note.tags] })),
      };
      const result = await importPortableDeckAtomic(parsed);
      navigate(`/app/decks/${result.deck.id}`);
    } catch (reason) { setError(message(reason)); setBusy(undefined); }
  }

  async function resetScheduling() {
    const current = deck(); if (!current) return;
    if (!window.confirm(`Reset all review history and scheduling for ${current.name}? The card content stays, but this cannot be undone.`)) return;
    setBusy("reset"); setError(undefined);
    try { await appApi.resetDeckScheduling(id()); setNotice("Scheduling reset. Every card is new again."); await load(); }
    catch (reason) { setError(message(reason)); }
    finally { setBusy(undefined); }
  }

  async function remove() {
    const current = deck(); if (!current) return;
    if (!window.confirm(`Delete ${current.name} and all ${current.card_count} cards? Export a .nut first if you may want it later.`)) return;
    setBusy("delete"); setError(undefined);
    try { await appApi.deleteDeck(id()); navigate("/app/decks", { replace: true }); }
    catch (reason) { setError(message(reason)); setBusy(undefined); }
  }

  return <AppShell>
    <Seo title={deck()?.name ?? "Deck"} description="Manage and study this Deez deck." path={`/app/decks/${id()}`} noindex />
    <Show when={error()}>{(value) => <div {...stylex.attrs(s.error)}>{value()}</div>}</Show>
    <Show when={notice()}>{(value) => <div {...stylex.attrs(s.success)}>{value()}</div>}</Show>
    <Show when={deck()}>{(current) => <>
      <div {...stylex.attrs(s.topRow)}>
        <div><a href="/app/decks">← My nuts</a><h1 {...stylex.attrs(s.appHeading)}>{current().name}</h1><p {...stylex.attrs(s.muted)}>{current().note_count} notes · {current().card_count} cards · {current().due_count} due</p></div>
        <div {...stylex.attrs(s.actions)}><a {...stylex.attrs(styles.button, styles.buttonSecondary)} href={`/app/decks/${id()}/notes/new`}>Add note</a><a {...stylex.attrs(styles.button)} href={`/app/decks/${id()}/study`}>Study</a></div>
      </div>

      <section {...stylex.attrs(s.panel)} data-deez="deck-settings">
        <div {...stylex.attrs(s.row)}><div><p {...stylex.attrs(styles.eyebrow)}>Deck settings</p><h2>Manage this nut</h2></div><span {...stylex.attrs(s.muted)}>Content and scheduling controls</span></div>
        <form onSubmit={renameDeck}>
          <label {...stylex.attrs(s.field)}><span {...stylex.attrs(s.label)}>Deck name</span><input {...stylex.attrs(s.input)} value={rename()} maxlength="200" required onInput={(event) => setRename(event.currentTarget.value)} /></label>
          <div {...stylex.attrs(s.actions)}>
            <button {...stylex.attrs(styles.button, styles.buttonSecondary)} disabled={Boolean(busy())} type="submit">{busy() === "rename" ? "Renaming…" : "Rename"}</button>
            <button {...stylex.attrs(styles.button, styles.buttonSecondary)} disabled={Boolean(busy())} type="button" onClick={() => void exportNut()}>{busy() === "export" ? "Exporting…" : "Export .nut"}</button>
            <button {...stylex.attrs(styles.button, styles.buttonSecondary)} disabled={Boolean(busy())} type="button" onClick={() => void duplicate()}>{busy() === "duplicate" ? "Duplicating…" : "Duplicate"}</button>
            <button {...stylex.attrs(styles.button, styles.buttonSecondary)} disabled={Boolean(busy())} type="button" onClick={() => void resetScheduling()}>{busy() === "reset" ? "Resetting…" : "Reset scheduling"}</button>
            <button {...stylex.attrs(styles.button, styles.buttonSecondary, s.danger)} disabled={Boolean(busy())} type="button" onClick={() => void remove()}>{busy() === "delete" ? "Deleting…" : "Delete deck"}</button>
          </div>
        </form>
      </section>

      <section style={{ "margin-top": "18px" }}>
        <div {...stylex.attrs(s.row)}><h2>Notes</h2><a href={`/app/decks/${id()}/cards`}>Inspect generated cards →</a></div>
        <div {...stylex.attrs(s.list)}><For each={notes()} fallback={<div {...stylex.attrs(s.panel)}>No notes yet.</div>}>
          {(note) => <a {...stylex.attrs(s.listItem)} href={`/app/decks/${id()}/notes/${note.id}`}><div {...stylex.attrs(s.row)}><strong>{note.preview || "Untitled note"}</strong><span {...stylex.attrs(s.muted)}>{note.note_type}</span></div><span {...stylex.attrs(s.muted)}>{note.card_count} card{note.card_count === 1 ? "" : "s"}</span></a>}
        </For></div>
      </section>
    </>}</Show>
  </AppShell>;
}
