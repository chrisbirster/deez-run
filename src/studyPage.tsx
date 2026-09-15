import { For, Show, createSignal, onCleanup } from "solid-js";
import { useParams } from "@solidjs/router";
import * as stylex from "@stylexjs/stylex";
import { appApi, type CardDetail, type Deck, type StudyPreview, type StudySessionOptions } from "./appApi";
import { AppShell } from "./appChrome";
import { appStyles as s } from "./appStyles.stylex";
import { safeCardMarkup } from "./cardMarkup";
import { Seo } from "./seo";
import { styles } from "./siteStyles";
import { StudyInteraction } from "./studyInteraction";

function message(reason: unknown) { return reason instanceof Error ? reason.message : "Something went wrong."; }
function interval(days: number) {
  if (days < 1 / 24) return `${(days * 24 * 60).toFixed(1)}m`;
  if (days < 1) return `${(days * 24).toFixed(1)}h`;
  return `${days.toFixed(1)}d`;
}
function reviewLabel(rating: 1 | 2 | 3 | 4) { return ({ 1: "Again", 2: "Hard", 3: "Good", 4: "Easy" } as const)[rating]; }
function formatDate(value?: number | null) { return value == null ? "—" : new Date(value).toLocaleString(); }

type LastReview = { cardId: string; wasNew: boolean; wasLearning: boolean };
type ReviewOrder = "due" | "reviews-first" | "new-first";
type SessionPreset = "due" | "quick10" | "reviews" | "new10" | "mixed20" | "custom";
type DoneReason = "queue" | "goal";

type SessionConfig = {
  preset: SessionPreset;
  goal?: number;
  newLimit?: number;
  order: ReviewOrder;
  shuffle: boolean;
};

const presets: Array<{ id: Exclude<SessionPreset, "custom">; label: string; detail: string; config: SessionConfig }> = [
  { id: "due", label: "Due all", detail: "Everything due", config: { preset: "due", order: "due", shuffle: false } },
  { id: "quick10", label: "Quick 10", detail: "10 cards · reviews first", config: { preset: "quick10", goal: 10, newLimit: 3, order: "reviews-first", shuffle: false } },
  { id: "reviews", label: "Reviews only", detail: "No new cards", config: { preset: "reviews", newLimit: 0, order: "reviews-first", shuffle: false } },
  { id: "new10", label: "New 10", detail: "10 new cards", config: { preset: "new10", goal: 10, newLimit: 10, order: "new-first", shuffle: false } },
  { id: "mixed20", label: "Mixed 20", detail: "10 review + up to 10 new", config: { preset: "mixed20", goal: 20, newLimit: 10, order: "due", shuffle: true } },
];

export function HostedStudyPage() {
  const params = useParams();
  const deckId = () => String(params.deckId ?? "");
  const [deck, setDeck] = createSignal<Deck>();
  const [card, setCard] = createSignal<CardDetail>();
  const [preview, setPreview] = createSignal<StudyPreview>();
  const [revealed, setRevealed] = createSignal(false);
  const [done, setDone] = createSignal(false);
  const [doneReason, setDoneReason] = createSignal<DoneReason>("queue");
  const [error, setError] = createSignal<string>();
  const [busy, setBusy] = createSignal(false);
  const [loading, setLoading] = createSignal(true);
  const [reviewed, setReviewed] = createSignal(0);
  const [learning, setLearning] = createSignal(0);
  const [startingDue, setStartingDue] = createSignal(0);
  const [currentWasNew, setCurrentWasNew] = createSignal(false);
  const [lastReview, setLastReview] = createSignal<LastReview>();
  const [buried, setBuried] = createSignal<string[]>([]);

  const [draftNewLimit, setDraftNewLimit] = createSignal("");
  const [draftGoal, setDraftGoal] = createSignal("");
  const [draftOrder, setDraftOrder] = createSignal<ReviewOrder>("due");
  const [draftShuffle, setDraftShuffle] = createSignal(false);
  const [appliedNewLimit, setAppliedNewLimit] = createSignal<number | undefined>();
  const [appliedGoal, setAppliedGoal] = createSignal<number | undefined>();
  const [appliedOrder, setAppliedOrder] = createSignal<ReviewOrder>("due");
  const [shuffleSeed, setShuffleSeed] = createSignal<number | undefined>();
  const [newSeen, setNewSeen] = createSignal(0);
  const [preset, setPreset] = createSignal<SessionPreset>("due");

  const sessionTarget = () => appliedGoal() ?? Math.max(0, startingDue());
  const remaining = () => Math.max(0, sessionTarget() - reviewed() - (appliedGoal() === undefined ? buried().length : 0));
  const progress = () => done() ? 100 : sessionTarget() === 0 ? 100 : Math.min(100, (reviewed() / sessionTarget()) * 100);

  function sessionOptions(): StudySessionOptions {
    return {
      newLimit: appliedNewLimit(),
      newSeen: newSeen(),
      order: appliedOrder(),
      shuffleSeed: shuffleSeed(),
      excludeCardIds: buried(),
    };
  }

  function cardState() {
    const current = card();
    if (!current) return "";
    if (currentWasNew() || current.review_count === 0) return "NEW";
    const last = current.reviews?.[current.reviews.length - 1];
    if (last?.rating === 1) return "RELEARNING";
    if ((current.scheduler?.stability_days ?? 1) < 1) return "LEARNING";
    return "REVIEW";
  }

  async function loadDeck() {
    const value = await appApi.getDeck(deckId());
    setDeck(value);
    setStartingDue(value.due_count);
  }

  async function next() {
    setLoading(true); setRevealed(false); setCard(undefined); setPreview(undefined); setError(undefined);
    try {
      const due = await appApi.nextStudyCard(deckId(), sessionOptions());
      if (!due.card) { setDoneReason("queue"); setDone(true); return; }
      const wasNew = due.card.due_at_ms === null;
      setCurrentWasNew(wasNew);
      if (wasNew) setNewSeen((value) => value + 1);
      setDone(false);
      const [detail, schedule] = await Promise.all([appApi.getCard(due.card.id), appApi.previewStudy(due.card.id)]);
      setCard(detail); setPreview(schedule);
    } catch (reason) { setError(message(reason)); }
    finally { setLoading(false); }
  }

  function parseOptionalInt(raw: string, label: string) {
    if (!raw.trim()) return undefined;
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} must be a non-negative integer.`);
    return value;
  }

  async function begin(config: SessionConfig) {
    setDraftGoal(config.goal === undefined ? "" : String(config.goal));
    setDraftNewLimit(config.newLimit === undefined ? "" : String(config.newLimit));
    setDraftOrder(config.order);
    setDraftShuffle(config.shuffle);
    setAppliedGoal(config.goal);
    setAppliedNewLimit(config.newLimit);
    setAppliedOrder(config.order);
    setShuffleSeed(config.shuffle ? Date.now() + Math.floor(Math.random() * 1_000_000) : undefined);
    setPreset(config.preset);
    setNewSeen(0); setReviewed(0); setLearning(0); setLastReview(undefined); setBuried([]); setDone(false); setDoneReason("queue");
    await loadDeck();
    await next();
  }

  async function restart(event?: SubmitEvent) {
    event?.preventDefault();
    try {
      const goal = parseOptionalInt(draftGoal(), "Session goal");
      const newLimit = parseOptionalInt(draftNewLimit(), "New-card limit");
      await begin({ preset: "custom", goal, newLimit, order: draftOrder(), shuffle: draftShuffle() });
    } catch (reason) { setError(message(reason)); }
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
      const nextReviewed = reviewed() + 1;
      setReviewed(nextReviewed);
      if (wasLearning) setLearning((value) => value + 1);
      setLastReview({ cardId: current.id, wasNew, wasLearning });
      if (appliedGoal() !== undefined && nextReviewed >= appliedGoal()!) {
        setDoneReason("goal"); setDone(true); setCard(undefined); setPreview(undefined); setLoading(false);
      } else {
        await next();
      }
    } catch (reason) { setError(message(reason)); }
    finally { setBusy(false); }
  }

  async function buryCurrent() {
    const current = card();
    if (!current || busy()) return;
    setBusy(true); setError(undefined);
    try {
      setBuried((values) => values.includes(current.id) ? values : [...values, current.id]);
      if (currentWasNew()) setNewSeen((value) => Math.max(0, value - 1));
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
      setCard(detail); setPreview(schedule); setRevealed(false); setDone(false); setTypedStateForUndo();
      setCurrentWasNew(last.wasNew);
      setReviewed((value) => Math.max(0, value - 1));
      if (last.wasLearning) setLearning((value) => Math.max(0, value - 1));
      if (last.wasNew) setNewSeen((value) => Math.max(0, value - 1));
      setLastReview(undefined);
    } catch (reason) { setError(message(reason)); }
    finally { setBusy(false); }
  }

  function setTypedStateForUndo() {
    // StudyInteraction owns answer-entry state and resets itself when card id changes.
  }

  const keydown = (event: KeyboardEvent) => {
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement || target instanceof HTMLButtonElement) return;
    if ((event.key === "u" || event.key === "U") && lastReview() && !busy()) { event.preventDefault(); void undo(); return; }
    if ((event.key === "b" || event.key === "B") && card() && !busy()) { event.preventDefault(); void buryCurrent(); return; }
    if (!revealed() && card() && (event.key === " " || event.key === "Enter")) { event.preventDefault(); setRevealed(true); return; }
    if (revealed() && !busy() && /^[1-4]$/.test(event.key)) { event.preventDefault(); void rate(Number(event.key) as 1 | 2 | 3 | 4); }
  };
  window.addEventListener("keydown", keydown);
  onCleanup(() => window.removeEventListener("keydown", keydown));

  void loadDeck().then(next).catch((reason) => { setError(message(reason)); setLoading(false); });
  const labels: Array<[1 | 2 | 3 | 4, "again" | "hard" | "good" | "easy", string, string]> = [
    [1, "again", "Again", "Forgot"], [2, "hard", "Hard", "Struggled"], [3, "good", "Good", "Knew it"], [4, "easy", "Easy", "Instant"],
  ];

  return <AppShell>
    <Seo title="Study" description="Study your synced Deez deck." path={`/app/decks/${deckId()}/study`} noindex />
    <div data-deez="study">
      <div {...stylex.attrs(s.topRow)} data-deez="study-heading">
        <div><a data-deez="study-back" href={`/app/decks/${deckId()}`}>← Deck</a><h1 {...stylex.attrs(s.appHeading)}>Study</h1><p {...stylex.attrs(s.muted)}>{deck()?.name ?? "Deck"} · Space/Enter reveal · 1–4 rate · B bury · U undo</p></div>
        <div {...stylex.attrs(s.actions)}>
          <Show when={lastReview()}><button {...stylex.attrs(styles.button, styles.buttonSecondary)} data-deez="secondary-button" disabled={busy()} onClick={() => void undo()}>↶ Undo last</button></Show>
          <a {...stylex.attrs(styles.button, styles.buttonSecondary)} data-deez="secondary-button" href={`/app/decks/${deckId()}/cards`}>Inspect cards</a>
        </div>
      </div>

      <section data-deez="study-progress">
        <div data-deez="progress-track"><span data-deez="progress-fill" style={{ width: `${progress()}%` }} /></div>
        <div data-deez="study-counters">
          <span><strong>{reviewed()}</strong> studied</span>
          <span><strong>{remaining()}</strong> session left</span>
          <span><strong>{newSeen()}</strong> new</span>
          <span><strong>{learning()}</strong> learning</span>
          <span><strong>{buried().length}</strong> buried</span>
        </div>
      </section>

      <Show when={error()}>{(value) => <div {...stylex.attrs(s.error)}>{value()}</div>}</Show>
      <form {...stylex.attrs(s.panel)} data-deez="study-controls" onSubmit={(event) => void restart(event)}>
        <div data-deez="study-presets">
          <For each={presets}>{(item) => <button type="button" data-deez="study-preset" data-active={preset() === item.id ? "true" : "false"} disabled={busy() || loading()} onClick={() => void begin(item.config)}><strong>{item.label}</strong><small>{item.detail}</small></button>}</For>
        </div>
        <div {...stylex.attrs(s.grid)} data-deez="study-control-grid">
          <label {...stylex.attrs(s.field)}><span {...stylex.attrs(s.label)}>Session goal</span><input {...stylex.attrs(s.input)} data-deez="study-input" type="number" min="0" step="1" value={draftGoal()} placeholder="All due" onInput={(event) => { setDraftGoal(event.currentTarget.value); setPreset("custom"); }} /></label>
          <label {...stylex.attrs(s.field)}><span {...stylex.attrs(s.label)}>New-card limit</span><input {...stylex.attrs(s.input)} data-deez="study-input" type="number" min="0" step="1" value={draftNewLimit()} placeholder="Unlimited" onInput={(event) => { setDraftNewLimit(event.currentTarget.value); setPreset("custom"); }} /></label>
          <label {...stylex.attrs(s.field)}><span {...stylex.attrs(s.label)}>Order</span><select {...stylex.attrs(s.select)} data-deez="study-input" value={draftOrder()} onChange={(event) => { setDraftOrder(event.currentTarget.value as ReviewOrder); setPreset("custom"); }}><option value="due">Due order</option><option value="reviews-first">Reviews first</option><option value="new-first">New first</option></select></label>
        </div>
        <label data-deez="study-check"><input type="checkbox" checked={draftShuffle()} onChange={(event) => { setDraftShuffle(event.currentTarget.checked); setPreset("custom"); }} /> <span>Shuffle within the selected ordering</span></label>
        <div {...stylex.attrs(s.actions)} data-deez="study-actions"><button {...stylex.attrs(styles.button, styles.buttonSecondary)} data-deez="secondary-button" type="submit" disabled={busy() || loading()}>Apply / restart session</button><span {...stylex.attrs(s.muted)}>Session: {reviewed()} / {sessionTarget() || "all"} reviewed</span></div>
      </form>

      <div data-deez="study-stage">
        <Show when={loading()}><div {...stylex.attrs(s.panel)} data-deez="study-loading" role="status" aria-live="polite"><strong>Loading next card…</strong><p {...stylex.attrs(s.muted)}>Building your study queue from the account cloud.</p></div></Show>
        <Show when={!loading()}>
          <Show when={done()} fallback={<Show when={card()}>{(current) => <>
            <section {...stylex.attrs(s.studyCard)} data-deez="study-card">
              <div data-deez="study-card-meta">
                <span data-deez="study-state" data-state={cardState().toLowerCase()}>{cardState()}</span>
                <span>{current().review_count} previous review{current().review_count === 1 ? "" : "s"}</span>
                <Show when={preview()?.retrievability != null}><span>{Math.round((preview()?.retrievability ?? 0) * 100)}% retrievability</span></Show>
              </div>
              <div {...stylex.attrs(s.studyFace)} data-deez="study-face" innerHTML={safeCardMarkup(revealed() ? current().rendered.back : current().rendered.front)} />
              <StudyInteraction card={current()} revealed={revealed()} />
              <div data-deez="study-card-actions">
                <Show when={!revealed()}><button {...stylex.attrs(styles.button)} data-deez="primary-button" onClick={() => setRevealed(true)}>Show answer</button></Show>
                <button {...stylex.attrs(styles.button, styles.buttonSecondary)} data-deez="secondary-button" disabled={busy()} onClick={() => void buryCurrent()}>Bury for session <kbd>B</kbd></button>
              </div>
            </section>
            <Show when={revealed() && preview()}>{(schedule) => <div {...stylex.attrs(s.ratingGrid)} data-deez="rating-grid"><For each={labels}>{([ratingValue, key, label, hint]) => <button {...stylex.attrs(styles.button, styles.buttonSecondary)} data-deez="rating-button" data-rating={key} disabled={busy()} onClick={() => void rate(ratingValue)}><span><kbd>{ratingValue}</kbd> {label}</span><small>{hint} · {interval(schedule().schedule[key].interval_days)}</small></button>}</For></div>}</Show>

            <details data-deez="study-history">
              <summary>Card history & scheduler</summary>
              <div data-deez="history-grid">
                <div><span>Reviews</span><strong>{current().review_count}</strong></div>
                <div><span>Stability</span><strong>{current().scheduler?.stability_days == null ? "—" : `${current().scheduler!.stability_days!.toFixed(2)}d`}</strong></div>
                <div><span>Difficulty</span><strong>{current().scheduler?.difficulty == null ? "—" : current().scheduler!.difficulty!.toFixed(2)}</strong></div>
                <div><span>Due</span><strong>{formatDate(current().scheduler?.due_at_ms)}</strong></div>
              </div>
              <Show when={(current().reviews?.length ?? 0) > 0} fallback={<p {...stylex.attrs(s.muted)}>No previous reviews. This is a new card.</p>}>
                <div data-deez="review-timeline"><For each={[...(current().reviews ?? [])].slice(-8).reverse()}>{(entry) => <div><span data-rating={entry.rating}>{reviewLabel(entry.rating)}</span><time>{formatDate(entry.reviewed_at_ms)}</time></div>}</For></div>
              </Show>
            </details>
          </>}</Show>}>
            <div {...stylex.attrs(s.panel)} data-deez="study-complete">
              <p {...stylex.attrs(styles.eyebrow)}>Session complete</p>
              <h2>{doneReason() === "goal" ? "Goal reached." : buried().length ? "No more unburied cards." : "All caught up."}</h2>
              <p {...stylex.attrs(s.muted)}>You reviewed {reviewed()} cards · {newSeen()} new · {learning()} learning · {buried().length} buried for this session.</p>
              <div data-deez="completion-stats"><div><strong>{reviewed()}</strong><span>Studied</span></div><div><strong>{newSeen()}</strong><span>New</span></div><div><strong>{learning()}</strong><span>Learning</span></div><div><strong>{buried().length}</strong><span>Buried</span></div></div>
              <div {...stylex.attrs(s.actions)} data-deez="study-actions"><button {...stylex.attrs(styles.button, styles.buttonSecondary)} data-deez="secondary-button" onClick={() => void begin({ preset: "due", order: "due", shuffle: false })}>Study again</button><a {...stylex.attrs(styles.button)} data-deez="primary-button" href={`/app/decks/${deckId()}`}>Back to deck</a></div>
            </div>
          </Show>
        </Show>
      </div>
    </div>
  </AppShell>;
}
