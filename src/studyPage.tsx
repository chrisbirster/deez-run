import { For, Show, createSignal, onCleanup } from "solid-js";
import { useParams } from "@solidjs/router";
import * as stylex from "@stylexjs/stylex";
import { appApi, type CardDetail, type StudyNextOptions, type StudyPreview } from "./appApi";
import { AppShell } from "./appChrome";
import { appStyles as s } from "./appStyles.stylex";
import { safeCardMarkup } from "./cardMarkup";
import { styles } from "./siteStyles";
import { Seo } from "./seo";

function message(reason: unknown) {
  return reason instanceof Error ? reason.message : "Something went wrong.";
}

function interval(days: number) {
  if (days < 1 / 24) return `${(days * 24 * 60).toFixed(1)}m`;
  if (days < 1) return `${(days * 24).toFixed(1)}h`;
  return `${days.toFixed(1)}d`;
}

export function HostedStudyPage() {
  const params = useParams();
  const deckId = () => String(params.deckId ?? "");
  const [card, setCard] = createSignal<CardDetail>();
  const [preview, setPreview] = createSignal<StudyPreview>();
  const [revealed, setRevealed] = createSignal(false);
  const [done, setDone] = createSignal(false);
  const [error, setError] = createSignal<string>();
  const [busy, setBusy] = createSignal(false);
  const [loading, setLoading] = createSignal(true);
  const [typedAnswer, setTypedAnswer] = createSignal("");

  const [draftNewLimit, setDraftNewLimit] = createSignal("");
  const [draftOrder, setDraftOrder] = createSignal<"due" | "reviews-first" | "new-first">("due");
  const [draftShuffle, setDraftShuffle] = createSignal(false);
  const [appliedNewLimit, setAppliedNewLimit] = createSignal<number | undefined>();
  const [appliedOrder, setAppliedOrder] = createSignal<"due" | "reviews-first" | "new-first">("due");
  const [shuffleSeed, setShuffleSeed] = createSignal<number | undefined>();
  const [newSeen, setNewSeen] = createSignal(0);

  function sessionOptions(): StudyNextOptions {
    return {
      newLimit: appliedNewLimit(),
      newSeen: newSeen(),
      order: appliedOrder(),
      shuffleSeed: shuffleSeed(),
    };
  }

  async function next() {
    setLoading(true);
    setTypedAnswer("");
    setRevealed(false);
    setCard(undefined);
    setPreview(undefined);
    setError(undefined);
    try {
      const due = await appApi.nextStudyCard(deckId(), sessionOptions());
      if (!due.card) {
        setDone(true);
        return;
      }
      if (due.card.due_at_ms === null) setNewSeen((value) => value + 1);
      setDone(false);
      const [detail, schedule] = await Promise.all([
        appApi.getCard(due.card.id),
        appApi.previewStudy(due.card.id),
      ]);
      setCard(detail);
      setPreview(schedule);
    } catch (reason) {
      setError(message(reason));
    } finally {
      setLoading(false);
    }
  }

  async function restart(event?: SubmitEvent) {
    event?.preventDefault();
    const raw = draftNewLimit().trim();
    if (raw) {
      const limit = Number(raw);
      if (!Number.isSafeInteger(limit) || limit < 0) {
        setError("New-card limit must be a non-negative integer.");
        return;
      }
      setAppliedNewLimit(limit);
    } else setAppliedNewLimit(undefined);
    setAppliedOrder(draftOrder());
    setShuffleSeed(draftShuffle() ? Date.now() + Math.floor(Math.random() * 1_000_000) : undefined);
    setNewSeen(0);
    await next();
  }

  async function rate(rating: 1 | 2 | 3 | 4) {
    const current = card();
    const schedule = preview();
    if (!current || !schedule || !revealed()) return;
    setBusy(true);
    try {
      await appApi.review(current.id, rating, schedule.review_count);
      await next();
    } catch (reason) {
      setError(message(reason));
    } finally {
      setBusy(false);
    }
  }

  const keydown = (event: KeyboardEvent) => {
    const target = event.target;
    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLSelectElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLButtonElement
    ) return;
    if (!revealed() && (event.key === " " || event.key === "Enter")) {
      event.preventDefault();
      setRevealed(true);
      return;
    }
    if (revealed() && !busy() && /^[1-4]$/.test(event.key)) {
      event.preventDefault();
      void rate(Number(event.key) as 1 | 2 | 3 | 4);
    }
  };
  window.addEventListener("keydown", keydown);
  onCleanup(() => window.removeEventListener("keydown", keydown));

  void next();
  const labels: Array<[1 | 2 | 3 | 4, "again" | "hard" | "good" | "easy", string]> = [
    [1, "again", "Again"],
    [2, "hard", "Hard"],
    [3, "good", "Good"],
    [4, "easy", "Easy"],
  ];

  return (
    <AppShell>
      <Seo title="Study" description="Study your synced Deez deck." path={`/app/decks/${deckId()}/study`} noindex />
      <div data-deez="study">
        <div {...stylex.attrs(s.topRow)} data-deez="study-heading">
          <div>
            <a data-deez="study-back" href={`/app/decks/${deckId()}`}>← Deck</a>
            <h1 {...stylex.attrs(s.appHeading)}>Study</h1>
            <p {...stylex.attrs(s.muted)}>Space/Enter reveals · 1 Again · 2 Hard · 3 Good · 4 Easy</p>
          </div>
          <a {...stylex.attrs(styles.button, styles.buttonSecondary)} data-deez="secondary-button" href={`/app/decks/${deckId()}/cards`}>Inspect cards</a>
        </div>

        <Show when={error()}>{(value) => <div {...stylex.attrs(s.error)}>{value()}</div>}</Show>

        <form {...stylex.attrs(s.panel)} data-deez="study-controls" onSubmit={(event) => void restart(event)}>
          <div {...stylex.attrs(s.grid)} data-deez="study-control-grid">
            <label {...stylex.attrs(s.field)}>
              <span {...stylex.attrs(s.label)}>New-card limit</span>
              <input {...stylex.attrs(s.input)} data-deez="study-input" type="number" min="0" step="1" value={draftNewLimit()} placeholder="Unlimited" onInput={(event) => setDraftNewLimit(event.currentTarget.value)} />
            </label>
            <label {...stylex.attrs(s.field)}>
              <span {...stylex.attrs(s.label)}>Order</span>
              <select {...stylex.attrs(s.select)} data-deez="study-input" value={draftOrder()} onChange={(event) => setDraftOrder(event.currentTarget.value as "due" | "reviews-first" | "new-first")}>
                <option value="due">Due order</option>
                <option value="reviews-first">Reviews first</option>
                <option value="new-first">New first</option>
              </select>
            </label>
          </div>
          <label data-deez="study-check"><input type="checkbox" checked={draftShuffle()} onChange={(event) => setDraftShuffle(event.currentTarget.checked)} /> <span>Shuffle within the selected ordering</span></label>
          <div {...stylex.attrs(s.actions)} data-deez="study-actions">
            <button {...stylex.attrs(styles.button, styles.buttonSecondary)} data-deez="secondary-button" type="submit" disabled={busy() || loading()}>Apply / restart session</button>
            <span {...stylex.attrs(s.muted)}>New cards introduced this session: {newSeen()}</span>
          </div>
        </form>

        <div data-deez="study-stage">
          <Show when={loading()}>
            <div {...stylex.attrs(s.panel)} data-deez="study-loading" role="status" aria-live="polite">
              <strong>Loading next card…</strong>
              <p {...stylex.attrs(s.muted)}>Building your study queue from the account cloud.</p>
            </div>
          </Show>
          <Show when={!loading()}>
            <Show
              when={done()}
              fallback={
                <Show when={card()}>
                  {(current) => (
                    <>
                      <section {...stylex.attrs(s.studyCard)} data-deez="study-card">
                        <div {...stylex.attrs(s.studyFace)} data-deez="study-face" innerHTML={safeCardMarkup(revealed() ? current().rendered.back : current().rendered.front)} />
                        <Show when={!revealed() && current().rendered.interaction.type === "type_answer"}>
                          <label {...stylex.attrs(s.field)} style={{ width: "100%" }}>
                            <span {...stylex.attrs(s.label)}>Your answer</span>
                            <input {...stylex.attrs(s.input)} data-deez="study-input" value={typedAnswer()} autocomplete="off" autocapitalize="off" onInput={(event) => setTypedAnswer(event.currentTarget.value)} />
                          </label>
                        </Show>
                        <Show when={revealed() && current().rendered.interaction.type === "type_answer" && typedAnswer().trim()}>
                          <p {...stylex.attrs(s.muted)}>Your answer: {typedAnswer()}</p>
                        </Show>
                        <Show when={!revealed()}>
                          <button {...stylex.attrs(styles.button)} data-deez="primary-button" onClick={() => setRevealed(true)}>Show answer</button>
                        </Show>
                      </section>
                      <Show when={revealed() && preview()}>
                        {(schedule) => (
                          <div {...stylex.attrs(s.ratingGrid)} data-deez="rating-grid">
                            <For each={labels}>
                              {([ratingValue, key, label]) => (
                                <button {...stylex.attrs(styles.button, styles.buttonSecondary)} data-deez="secondary-button" disabled={busy()} onClick={() => void rate(ratingValue)}>
                                  <span>{ratingValue} {label}</span>&nbsp;<small>{interval(schedule().schedule[key].interval_days)}</small>
                                </button>
                              )}
                            </For>
                          </div>
                        )}
                      </Show>
                    </>
                  )}
                </Show>
              }
            >
              <div {...stylex.attrs(s.panel)} data-deez="study-loading">
                <h2>All caught up.</h2>
                <p {...stylex.attrs(s.muted)}>No cards remain under the current session controls.</p>
                <div {...stylex.attrs(s.actions)} data-deez="study-actions">
                  <button {...stylex.attrs(styles.button, styles.buttonSecondary)} data-deez="secondary-button" onClick={() => void restart()}>Restart session</button>
                  <a {...stylex.attrs(styles.button)} data-deez="primary-button" href={`/app/decks/${deckId()}`}>Back to deck</a>
                </div>
              </div>
            </Show>
          </Show>
        </div>
      </div>
    </AppShell>
  );
}
