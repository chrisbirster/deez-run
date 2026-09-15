import { For, Show, createSignal } from "solid-js";
import * as stylex from "@stylexjs/stylex";
import { appApi, type Deck, type Stats } from "./appApi";
import { AppShell } from "./appChrome";
import { appStyles as s } from "./appStyles.stylex";
import { importPortableDeckAtomic, type ImportProgress, type ImportStage } from "./importPipeline";
import { parsePortableDeck, portableFilename, serializeDeckJsonV2, serializeNutV2 } from "./portable";
import { Seo } from "./seo";
import { styles } from "./siteStyles";

function message(reason: unknown) {
  return reason instanceof Error ? reason.message : "Something went wrong.";
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

const stageOrder: ImportStage[] = ["writing-local", "uploading", "generating", "complete"];
const stageLabel: Record<ImportStage, string> = {
  "writing-local": "Writing locally",
  uploading: "Uploading notes",
  generating: "Generating cards",
  complete: "Complete",
  attention: "Needs attention",
};

function ImportProgressPanel(props: { value?: ImportProgress }) {
  return (
    <Show when={props.value}>{(progress) => {
      const currentIndex = stageOrder.indexOf(progress().stage);
      const fraction = progress().total === 0 ? 1 : Math.min(1, progress().written / progress().total);
      return (
        <section {...stylex.attrs(s.panel)} data-deez="import-progress" aria-live="polite">
          <div {...stylex.attrs(s.row)}>
            <div>
              <p {...stylex.attrs(styles.eyebrow)}>Import status</p>
              <h2>{progress().name}</h2>
            </div>
            <strong>{stageLabel[progress().stage]}</strong>
          </div>
          <div data-deez="progress-track"><span data-deez="progress-fill" style={{ width: `${Math.max(4, fraction * 100)}%` }} /></div>
          <div data-deez="import-stages">
            <For each={stageOrder}>{(stage, index) => (
              <span data-complete={progress().stage === "complete" || currentIndex > index() ? "true" : "false"} data-current={progress().stage === stage ? "true" : "false"}>
                {stageLabel[stage]}
              </span>
            )}</For>
          </div>
          <p {...stylex.attrs(s.muted)}>
            {progress().written}/{progress().total} notes safely written · {progress().pending} pending · {progress().rejected} rejected · {progress().cloudCards} cloud cards
          </p>
          <Show when={progress().stage === "attention"}>
            <div {...stylex.attrs(s.error)} style={{ "margin-bottom": "0" }}>
              Your local copy is preserved. Resolve rejected notes or pending sync from Offline diagnostics; Deez will never auto-delete this import.
            </div>
          </Show>
        </section>
      );
    }}</Show>
  );
}

export function ToolsPage() {
  const [stats, setStats] = createSignal<Stats>();
  const [decks, setDecks] = createSignal<Deck[]>([]);
  const [file, setFile] = createSignal<File>();
  const [busy, setBusy] = createSignal(false);
  const [notice, setNotice] = createSignal<string>();
  const [error, setError] = createSignal<string>();
  const [progress, setProgress] = createSignal<ImportProgress>();

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
    try {
      const snapshot = await appApi.snapshotDeck(deck.id);
      const notes = snapshot.notes.map((note) => ({ note_type: note.note_type, fields: [...note.fields], tags: [...note.tags] }));
      const contents = format === "nut" ? serializeNutV2(deck.name, notes) : serializeDeckJsonV2(deck.name, notes);
      download(portableFilename(deck.name, format), contents, format === "nut" ? "application/x-ndjson" : "application/json");
      setNotice(`Exported ${deck.name}. Review history stays private to your account.`);
    } catch (reason) {
      setError(message(reason));
    } finally {
      setBusy(false);
    }
  }

  async function importDeck(event: SubmitEvent) {
    event.preventDefault();
    const selected = file();
    if (!selected) { setError("Choose a .nut or deez.deck JSON file first."); return; }
    setBusy(true);
    setError(undefined);
    setNotice(undefined);
    setProgress(undefined);
    try {
      const parsed = parsePortableDeck(await selected.text(), selected.name);
      const result = await importPortableDeckAtomic(parsed, setProgress);
      if (result.progress.stage === "complete") {
        setNotice(`Imported ${parsed.name}: ${parsed.notes.length} logical notes are durable and synced.`);
      } else {
        setNotice(`Imported ${parsed.name} locally. ${result.progress.pending} changes remain queued and ${result.progress.rejected} need attention.`);
      }
      setFile(undefined);
      await load();
    } catch (reason) {
      setError(`${message(reason)} Any local data committed before this error has been preserved.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell>
      <Seo title="Deez tools" description="Import, export, inspect, and check synced Deez statistics." path="/app/tools" noindex />
      <div {...stylex.attrs(s.topRow)}>
        <div><p {...stylex.attrs(styles.eyebrow)}>Parity tools</p><h1 {...stylex.attrs(s.appHeading)}>Your Deez, portable.</h1></div>
        <a {...stylex.attrs(styles.button, styles.buttonSecondary)} href="/app/offline">Offline diagnostics</a>
      </div>

      <Show when={error()}>{(value) => <div {...stylex.attrs(s.error)}>{value()}</div>}</Show>
      <Show when={notice()}>{(value) => <div {...stylex.attrs(s.success)}>{value()}</div>}</Show>
      <ImportProgressPanel value={progress()} />

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
        <p {...stylex.attrs(s.muted)}>The entire deck is committed to IndexedDB first in one transaction. Sync then uploads notes in batches; a bad note is isolated instead of rolling back the deck.</p>
        <form onSubmit={importDeck}>
          <label {...stylex.attrs(s.field)}>
            <span {...stylex.attrs(s.label)}>Deck file</span>
            <input {...stylex.attrs(s.input)} type="file" accept=".nut,.json,application/x-ndjson,application/json" onChange={(event) => setFile(event.currentTarget.files?.[0])} />
          </label>
          <button {...stylex.attrs(styles.button)} disabled={busy()}>{busy() ? "Importing…" : "Import deck"}</button>
        </form>
      </section>

      <section style={{ "margin-top": "24px" }}>
        <h2>Export or inspect</h2>
        <div {...stylex.attrs(s.list)}>
          <For each={decks()} fallback={<div {...stylex.attrs(s.panel)}>No decks yet.</div>}>
            {(deck) => (
              <div {...stylex.attrs(s.listItem)}>
                <div {...stylex.attrs(s.row)}>
                  <div><strong>{deck.name}</strong><p {...stylex.attrs(s.muted)}>{deck.note_count} notes · {deck.card_count} cards · {deck.due_count} due</p></div>
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
    </AppShell>
  );
}
