import { For, Show, createSignal, onCleanup } from "solid-js";
import { useParams } from "@solidjs/router";
import * as stylex from "@stylexjs/stylex";
import { appApi, type CardDetail, type Deck, type StudyNextOptions, type StudyPreview } from "./appApi";
import { AppShell } from "./appChrome";
import { appStyles as s } from "./appStyles.stylex";
import { safeCardMarkup } from "./cardMarkup";
import { styles } from "./siteStyles";
import { Seo } from "./seo";

function message(reason: unknown) { return reason instanceof Error ? reason.message : "Something went wrong."; }
function interval(days: number) {
  if (days < 1 / 24) return `${(days * 24 * 60).toFixed(1)}m`;
  if (days < 1) return `${(days * 24).toFixed(1)}h`;
  return `${days.toFixed(1)}d`;
}

type LastReview = { cardId: string; wasNew: boolean; wasLearning: boolean };

export function HostedStudyPage() {
  const params = useParams();
  const deckId = () => String(params.deckId ?? "");
  const [deck, setDeck] = createSignal<Deck>();
  const [card, setCard] = createSignal<CardDetail>();
  const [preview, setPreview] = createSignal<StudyPreview>();
  const [revealed, setRevealed] = createSignal(false);
  const [done, setDone] = createSignal(false);
  const [error, setError] = createSignal<string>();
  const [busy, setBusy] = createSignal(false);
  const [loading, setLoading] = createSignal(true);
  const [typedAnswer, setTypedAnswer] = createSignal("");
  const [reviewed, setReviewed] = createSignal(0);
  const [learning, setLearning] = createSignal(0);
  const [startingDue, setStartingDue] = createSignal(0);
  const [currentWasNew, setCurrentWasNew] = createSignal(false);
  const [lastReview, setLastReview] = createSignal<LastReview>();

  const [draftNewLimit, setDraftNewLimit] = createSignal("");
  const [draftOrder, setDraftOrder] = createSignal<"due" | "reviews-first" | "new-first">("due");
  const [draftShuffle, setDraftShuffle] = createSignal(false);
  const [appliedNewLimit, setAppliedNewLimit] = createSignal<number | undefined>();
  const [appliedOrder, setAppliedOrder] = createSignal<"due" | "reviews-first" | "new-first">("due");
  const [shuffleSeed, setShuffleSeed] = createSignal<number | undefined>();
  const [newSeen, setNewSeen] = createSignal(0);

  const remaining = () => Math.max(0, startingDue() - reviewed());
  const progress = () => startingDue() === 0 ? 100 : Math.min(100, (reviewed() / startingDue()) * 100);

  function sessionOptions(): StudyNextOptions {
    return { newLimit: appliedNewLimit(), newSeen: newSeen(), order: appliedOrder(), shuffleSeed: shuffleSeed() };
  }

  async function loadDeck() {
    const value = await appApi.getDeck(deckId());
    setDeck(value);
    setStartingDue(value.due_count);
  }

  async function next() {
    setLoading(true); setTypedAnswer(""); setRevealed(false); setCard(undefined); setPreview(undefined); setError(undefined);
    try {
      const due = await appApi.nextStudyCard(deckId(), sessionOptions());
      if (!due.card) { setDone(true); return; }
      const wasNew = due.card.due_at_ms === null;
      setCurrentWasNew(wasNew);
      if (wasNew) setNewSeen((value) => value + 1);
      setDone(false);
      const [detail, schedule] = await Promise.all([appApi.getCard(due.card.id), appApi.previewStudy(due.card.id)]);
      setCard(detail); setPreview(schedule);
    } catch (reason) { setError(message(reason)); }
    finally { setLoading(false); }
  }

  async function restart(event?: SubmitEvent) {
    event?.preventDefault();
    const raw = draftNewLimit().trim();
    if (raw) {
      const limit = Number(raw);
      if (!Number.isSafeInteger(limit) || limit < 0) { setError("New-card limit must be a non-negative integer."); return; }
      setAppliedNewLimit(limit);
    } else setAppliedNewLimit(undefined);
    setAppliedOrder(draftOrder());
    setShuffleSeed(draftShuffle() ? Date.now() + Math.floor(Math.random() * 1_000_000) : undefined);
    setNewSeen(0); setReviewed(0); setLearning(0); setLastReview(undefined);
    await loadDeck();
    await next();
  }

  async function rate(rating: 1 | 2 | 3 | 4) {
    const current = card();
    const schedule = preview();
    if (!current || !schedule || !revealed()) return;
    setBusy(true); setError(undefined);
    const key = ({ 1: "again", 2: "hard", 3: "good", 4: "easy" } as const)[rating];
    const wasLearning = schedule.schedule[key].interval_days < 1;
    const wasNew = currentWasNew();
    try {
      await appApi.review(current.id, rating, schedule.review_count);
      setReviewed((value) => value + 1);
      if (wasLearning) setLearning((value) => value + 1);
      setLastReview({ cardId: current.id, wasNew, wasLearning });
      await next();
    } catch (reason) { setError(message(reason)); }
    finally { setBusy(false); }
  }

  async function undo() {
    const last = lastReview();
    if (!last || busy()) return;
    setBusy(true); setError(undefined);
    try {
      await appApi.undoLastReview(last.cardId);
      const [detail, schedule] = await Promise.all([appApi.getCard(last.cardId), appApi.previewStudy(last.cardId)]);
      setCard(detail); setPreview(schedule); setRevealed(false); setDone(false); setTypedAnswer("");
      setCurrentWasNew(last.wasNew);
      setReviewed((value) => Math.max(0, value - 1));
      if (last.wasLearning) setLearning((value) => Math.max(0, value - 1));
      if (last.wasNew) setNewSeen((value) => Math.max(0, value - 1));
      setLastReview(undefined);
    } catch (reason) { setError(message(reason)); }
    finally { setBusy(false); }
  }

  const keydown = (event: KeyboardEvent) => {
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement || target instanceof HTMLButtonElement) return;
    if ((event.key === "u" || event.key === "U") && lastReview() && !busy()) { event.preventDefault(); void undo(); return; }
    if (!revealed() && (event.key === " " || event.key === "Enter")) { event.preventDefault(); setRevealed(true); return; }
    if (revealed() && !busy() && /^[1-4]$/.test(event.key)) { event.preventDefault(); void rate(Number(event.key) as 1 | 2 | 3 | 4); }
  };
  window.addEventListener("keydown", keydown);
  onCleanup(() => window.removeEventListener("keydown", keydown));

  void loadDeck().then(next).catch((reason) => { setError(message(reason)); setLoading(false); });
  const labels: Array<[1 | 2 | 3 | 4, "again" | "hard" | "good" | "easy", string]> = [[1, "again", "Again"], [2, "hard", "Hard"], [3, "good", "Good"], [4, "easy", "Easy"]];

  return <AppShell>
    <Seo title="Study" description="Study your synced Deez deck." path={`/app/decks/${deckId()}/study`} noindex />
    <div data-deez="study">
      <div {...stylex.attrs(s.topRow)} data-deez="study-heading">
        <div><a data-deez="study-back" href={`/app/decks/${deckId()}`}>← Deck</a><h1 {...stylex.attrs(s.appHeading)}>Study</h1><p {...stylex.attrs(s.muted)}>{deck()?.name ?? "Deck"} · Space/Enter reveal · 1–4 rate · U undo</p></div>
        <div {...stylex.attrs(s.actions)}>
          <Show when={lastReview()}><button {...stylex.attrs(styles.button, styles.buttonSecondary)} data-deez="secondary-button" disabled={busy()} onClick={() => void undo()}>↶ Undo last</button></Show>
          <a {...stylex.attrs(styles.button, styles.buttonSecondary)} data-deez="secondary-button" href={`/app/decks/${deckId()}/cards`}>Inspect cards</a>
        </div>
      </div>

      <section data-deez="study-progress">
        <div data-deez="progress-track"><span data-deez="progress-fill" style={{ width: `${progress()}%` }} /></div>
        <div data-deez="study-counters">
          <span><strong>{reviewed()}</strong> studied</span>
          <span><strong>{remaining()}</strong> due left</span>
          <span><strong>{newSeen()}</strong> new</span>
          <span><strong>{learning()}</strong> learning</span>
        </div>
      </section>

      <Show when={error()}>{(value) => <div {...stylex.attrs(s.error)}>{value()}</div>}</Show>
      <form {...stylex.attrs(s.panel)} data-deez="study-controls" onSubmit={(event) => void restart(event)}>
        <div {...stylex.attrs(s.grid)} data-deez="study-control-grid">
          <label {...stylex.attrs(s.field)}><span {...stylex.attrs(s.label)}>New-card limit</span><input {...stylex.attrs(s.input)} data-deez="study-input" type="number" min="0" step="1" value={draftNewLimit()} placeholder="Unlimited" onInput={(event) => setDraftNewLimit(event.currentTarget.value)} /></label>
          <label {...stylex.attrs(s.field)}><span {...stylex.attrs(s.label)}>Order</span><select {...stylex.attrs(s.select)} data-deez="study-input" value={draftOrder()} onChange={(event) => setDraftOrder(event.currentTarget.value as "due" | "reviews-first" | "new-first")}><option value="due">Due order</option><option value="reviews-first">Reviews first</option><option value="new-first">New first</option></select></label>
        </div>
        <label data-deez="study-check"><input type="checkbox" checked={draftShuffle()} onChange={(event) => setDraftShuffle(event.currentTarget.checked)} /> <span>Shuffle within the selected ordering</span></label>
        <div {...stylex.attrs(s.actions)} data-deez="study-actions"><button {...stylex.attrs(styles.button, styles.buttonSecondary)} data-deez="secondary-button" type="submit" disabled={busy() || loading()}>Apply / restart session</button><span {...stylex.attrs(s.muted)}>Session: {reviewed()} / {startingDue()} reviewed</span></div>
      </form>

      <div data-deez="study-stage">
        <Show when={loading()}><div {...stylex.attrs(s.panel)} data-deez="study-loading" role="status" aria-live="polite"><strong>Loading next card…</strong><p {...stylex.attrs(s.muted)}>Building your study queue from the account cloud.</p></div></Show>
        <Show when={!loading()}>
          <Show when={done()} fallback={<Show when={card()}>{(current) => <>
            <section {...stylex.attrs(s.studyCard)} data-deez="study-card">
              <div {...stylex.attrs(s.studyFace)} data-deez="study-face" innerHTML={safeCardMarkup(revealed() ? current().rendered.back : current().rendered.front)} />
              <Show when={!revealed() && current().rendered.interaction.type === "type_answer"}><label {...stylex.attrs(s.field)} style={{ width: "100%" }}><span {...stylex.attrs(s.label)}>Your answer</span><input {...stylex.attrs(s.input)} data-deez="study-input" value={typedAnswer()} autocomplete="off" autocapitalize="off" onInput={(event) => setTypedAnswer(event.currentTarget.value)} /></label></Show>
              <Show when={revealed() && current().rendered.interaction.type === "type_answer" && typedAnswer().trim()}><p {...stylex.attrs(s.muted)}>Your answer: {typedAnswer()}</p></Show>
              <Show when={!revealed()}><button {...stylex.attrs(styles.button)} data-deez="primary-button" onClick={() => setRevealed(true)}>Show answer</button></Show>
            </section>
            <Show when={revealed() && preview()}>{(schedule) => <div {...stylex.attrs(s.ratingGrid)} data-deez="rating-grid"><For each={labels}>{([ratingValue, key, label]) => <button {...stylex.attrs(styles.button, styles.buttonSecondary)} data-deez="secondary-button" disabled={busy()} onClick={() => void rate(ratingValue)}><span>{ratingValue} {label}</span>&nbsp;<small>{interval(schedule().schedule[key].interval_days)}</small></button>}</For></div>}</Show>
          </>}</Show>}>
            <div {...stylex.attrs(s.panel)} data-deez="study-loading"><p {...stylex.attrs(styles.eyebrow)}>Session complete</p><h2>All caught up.</h2><p {...stylex.attrs(s.muted)}>You reviewed {reviewed()} cards · {newSeen()} new · {learning()} learning.</p><div {...stylex.attrs(s.actions)} data-deez="study-actions"><button {...stylex.attrs(styles.button, styles.buttonSecondary)} data-deez="secondary-button" onClick={() => void restart()}>Study again</button><a {...stylex.attrs(styles.button)} data-deez="primary-button" href={`/app/decks/${deckId()}`}>Back to deck</a></div></div>
          </Show>
        </Show>
      </div>
    </div>
  </AppShell>;
}
