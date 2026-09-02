import { For, Show, createSignal, onCleanup, onMount, type ParentProps } from "solid-js";
import { useParams } from "@solidjs/router";
import * as stylex from "@stylexjs/stylex";
import { ApiError, appApi, type CardDetail, type StudyNextOptions, type StudyPreview, type User } from "./appApi";
import { appStyles as s } from "./appStyles.stylex";
import { styles } from "./siteStyles";
import { Seo } from "./seo";

function message(reason: unknown) {
  return reason instanceof Error ? reason.message : "Something went wrong.";
}

function StudyShell(props: ParentProps) {
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

  return <div {...stylex.attrs(s.appShell)}>
    <aside {...stylex.attrs(s.side)}>
      <Show when={user()} fallback={<p {...stylex.attrs(s.muted)}>Connecting…</p>}>{(current) => <p><strong>@{current().username ?? "new-user"}</strong><br /><span {...stylex.attrs(s.muted)}>{current().email}</span></p>}</Show>
      <nav {...stylex.attrs(s.sideNav)} aria-label="My Deez">
        <a {...stylex.attrs(s.sideLink)} href="/app">Today</a>
        <a {...stylex.attrs(s.sideLink)} href="/app/decks">My nuts</a>
        <a {...stylex.attrs(s.sideLink)} href="/app/offline">Offline</a>
        <a {...stylex.attrs(s.sideLink)} href="/app/tools">Tools</a>
        <a {...stylex.attrs(s.sideLink)} href="/app/settings">Settings</a>
      </nav>
    </aside>
    <div {...stylex.attrs(s.main)}><Show when={authError()}>{(value) => <div {...stylex.attrs(s.error)}>{value()}</div>}</Show>{props.children}</div>
  </div>;
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
    setRevealed(false); setCard(undefined); setPreview(undefined); setError(undefined);
    try {
      const due = await appApi.nextStudyCard(deckId(), sessionOptions());
      if (!due.card) { setDone(true); return; }
      if (due.card.due_at_ms === null) setNewSeen((value) => value + 1);
      setDone(false);
      const [detail, schedule] = await Promise.all([appApi.getCard(due.card.id), appApi.previewStudy(due.card.id)]);
      setCard(detail); setPreview(schedule);
    } catch (reason) { setError(message(reason)); }
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
    setNewSeen(0);
    await next();
  }

  async function rate(rating: 1 | 2 | 3 | 4) {
    const current = card(); const schedule = preview();
    if (!current || !schedule || !revealed()) return;
    setBusy(true);
    try { await appApi.review(current.id, rating, schedule.review_count); await next(); }
    catch (reason) { setError(message(reason)); }
    finally { setBusy(false); }
  }

  onMount(() => {
    const keydown = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement || target instanceof HTMLButtonElement) return;
      if (!revealed() && (event.key === " " || event.key === "Enter")) {
        event.preventDefault(); setRevealed(true); return;
      }
      if (revealed() && !busy() && /^[1-4]$/.test(event.key)) {
        event.preventDefault(); void rate(Number(event.key) as 1 | 2 | 3 | 4);
      }
    };
    window.addEventListener("keydown", keydown);
    onCleanup(() => window.removeEventListener("keydown", keydown));
  });

  void next();
  const labels: Array<[1 | 2 | 3 | 4, "again" | "hard" | "good" | "easy", string]> = [[1, "again", "Again"], [2, "hard", "Hard"], [3, "good", "Good"], [4, "easy", "Easy"]];

  return <StudyShell>
    <Seo title="Study" description="Study your synced Deez deck." path={`/app/decks/${deckId()}/study`} noindex />
    <div {...stylex.attrs(s.topRow)}><div><a href={`/app/decks/${deckId()}`}>← Deck</a><h1 {...stylex.attrs(s.appHeading)}>Study</h1><p {...stylex.attrs(s.muted)}>Space/Enter reveals · 1 Again · 2 Hard · 3 Good · 4 Easy</p></div><a {...stylex.attrs(styles.button, styles.buttonSecondary)} href={`/app/decks/${deckId()}/cards`}>Inspect cards</a></div>
    <Show when={error()}>{(value) => <div {...stylex.attrs(s.error)}>{value()}</div>}</Show>

    <form {...stylex.attrs(s.panel)} onSubmit={(event) => void restart(event)}>
      <div {...stylex.attrs(s.grid)}>
        <label {...stylex.attrs(s.field)}><span {...stylex.attrs(s.label)}>New-card limit</span><input {...stylex.attrs(s.input)} type="number" min="0" step="1" value={draftNewLimit()} placeholder="Unlimited" onInput={(event) => setDraftNewLimit(event.currentTarget.value)} /></label>
        <label {...stylex.attrs(s.field)}><span {...stylex.attrs(s.label)}>Order</span><select {...stylex.attrs(s.select)} value={draftOrder()} onChange={(event) => setDraftOrder(event.currentTarget.value as "due" | "reviews-first" | "new-first")}><option value="due">Due order</option><option value="reviews-first">Reviews first</option><option value="new-first">New first</option></select></label>
      </div>
      <label><input type="checkbox" checked={draftShuffle()} onChange={(event) => setDraftShuffle(event.currentTarget.checked)} /> Shuffle within the selected ordering</label>
      <div {...stylex.attrs(s.actions)} style={{ "margin-top": "14px" }}><button {...stylex.attrs(styles.button, styles.buttonSecondary)} type="submit" disabled={busy()}>Apply / restart session</button><span {...stylex.attrs(s.muted)}>New cards introduced this session: {newSeen()}</span></div>
    </form>

    <div style={{ "margin-top": "16px" }}>
      <Show when={done()} fallback={<Show when={card()}>{(current) => <><section {...stylex.attrs(s.studyCard)}><div {...stylex.attrs(s.studyFace)}>{revealed() ? current().rendered.back : current().rendered.front}</div><Show when={!revealed()}><button {...stylex.attrs(styles.button)} onClick={() => setRevealed(true)}>Show answer</button></Show></section><Show when={revealed() && preview()}>{(schedule) => <div {...stylex.attrs(s.ratingGrid)}><For each={labels}>{([ratingValue, key, label]) => <button {...stylex.attrs(styles.button, styles.buttonSecondary)} disabled={busy()} onClick={() => void rate(ratingValue)}><span>{ratingValue} {label}</span>&nbsp;<small>{interval(schedule().schedule[key].interval_days)}</small></button>}</For></div>}</Show></>}</Show>}><div {...stylex.attrs(s.panel)}><h2>All caught up.</h2><p {...stylex.attrs(s.muted)}>No cards remain under the current session controls.</p><div {...stylex.attrs(s.actions)}><button {...stylex.attrs(styles.button, styles.buttonSecondary)} onClick={() => void restart()}>Restart session</button><a {...stylex.attrs(styles.button)} href={`/app/decks/${deckId()}`}>Back to deck</a></div></div></Show>
    </div>
  </StudyShell>;
}
