import { For, Show, createSignal, onCleanup } from "solid-js";
import * as stylex from "@stylexjs/stylex";
import { appApi, type Deck } from "./appApi";
import { AppShell } from "./appChrome";
import { appStyles as s } from "./appStyles.stylex";
import { Seo } from "./seo";
import { UiIcon, type UiIconName } from "./uiIcons";

function message(reason: unknown) { return reason instanceof Error ? reason.message : "Something went wrong."; }
function deckIcon(deck: Deck): UiIconName { const name = deck.name.toLowerCase(); if (name.includes("aws") || name.includes("cloud")) return "cloud"; if (name.includes("ssh") || name.includes("linux") || name.includes("terminal")) return "terminal"; return "card"; }
function deckTag(deck: Deck) { const name = deck.name.toLowerCase(); if (name.includes("aws") || name.includes("cloud")) return "CLOUD"; if (name.includes("ssh") || name.includes("linux") || name.includes("terminal")) return "TECH"; return "DECK"; }
function startOfLocalDay() { const now = new Date(); return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime(); }

export function DashboardPage() {
  const [decks, setDecks] = createSignal<Deck[]>([]);
  const [studiedToday, setStudiedToday] = createSignal(0);
  const [error, setError] = createSignal<string>();
  let loading: Promise<void> | undefined;

  function load() {
    if (loading) return loading;
    loading = (async () => {
      try {
        const library = await appApi.listDecks();
        setDecks(library);
        if (navigator.onLine) {
          const snapshots = await Promise.all(library.map((deck) => appApi.snapshotDeck(deck.id)));
          const day = startOfLocalDay();
          setStudiedToday(snapshots.reduce((total, snapshot) => total + snapshot.cards.filter((card) => (card.last_reviewed_at_ms ?? 0) >= day).length, 0));
        }
        setError(undefined);
      } catch (reason) { setError(message(reason)); }
    })().finally(() => { loading = undefined; });
    return loading;
  }
  void load();

  const refresh = () => { void load(); };
  const visible = () => { if (document.visibilityState === "visible") void load(); };
  window.addEventListener("deez:cloud-changed", refresh);
  window.addEventListener("focus", refresh);
  document.addEventListener("visibilitychange", visible);
  onCleanup(() => {
    window.removeEventListener("deez:cloud-changed", refresh);
    window.removeEventListener("focus", refresh);
    document.removeEventListener("visibilitychange", visible);
  });

  const dueDecks = () => decks().filter((deck) => deck.due_count > 0).sort((a, b) => b.due_count - a.due_count);
  const due = () => decks().reduce((sum, deck) => sum + deck.due_count, 0);
  const totalCards = () => decks().reduce((sum, deck) => sum + deck.card_count, 0);
  const studyHref = () => dueDecks()[0] ? `/app/decks/${dueDecks()[0].id}/study` : "/app/decks";

  return <AppShell>
    <Seo title="My Deez" description="Your synced Deez study queue." path="/app" noindex />
    <div {...stylex.attrs(s.dashboard)} data-deez="dashboard">
      <Show when={error()}>{(value) => <div {...stylex.attrs(s.error)}>{value()}</div>}</Show>
      <section {...stylex.attrs(s.dashboardHero)} data-deez="dashboard-hero">
        <div {...stylex.attrs(s.heroGrid)} data-deez="hero-grid" />
        <div {...stylex.attrs(s.heroCopy)} data-deez="hero-copy"><p {...stylex.attrs(s.heroKicker)} data-deez="hero-kicker">Today</p><div {...stylex.attrs(s.heroTitleRow)}><h1 {...stylex.attrs(s.heroNumber)} data-deez="hero-number">{due()}</h1><h2 {...stylex.attrs(s.heroTitle)} data-deez="hero-title">cards due</h2></div><p {...stylex.attrs(s.heroSub)} data-deez="hero-sub">Time to build a sharper you.</p></div>
        <div {...stylex.attrs(s.heroVisual)} aria-hidden="true"><div {...stylex.attrs(s.heroSun)} data-deez="hero-sun" /><div {...stylex.attrs(s.mountainBack)} /><div {...stylex.attrs(s.mountainFront)} /><div {...stylex.attrs(s.horizon)} /></div>
        <div {...stylex.attrs(s.studyButtonWrap)}><a {...stylex.attrs(s.studyButton)} data-deez="study-button" href={studyHref()}><span>▶</span><span>Study now</span><span>→</span></a></div>
      </section>
      <div {...stylex.attrs(s.sectionHeader)} data-deez="section-header"><span {...stylex.attrs(s.sectionLabel)} data-deez="section-label">Due today</span><a {...stylex.attrs(s.subtleLink)} data-deez="subtle-link" href="/app/decks">View all nuts&nbsp; →</a></div>
      <div {...stylex.attrs(s.dashboardDeckGrid)} data-deez="deck-grid">
        <For each={dueDecks()} fallback={<div {...stylex.attrs(s.panel)}><strong>You’re caught up.</strong><p {...stylex.attrs(s.muted)}>No cards are due right now.</p></div>}>
          {(deck) => <a {...stylex.attrs(s.dashboardDeckCard)} data-deez="deck-card" href={`/app/decks/${deck.id}/study`}><div {...stylex.attrs(s.deckIconBox)} data-deez="deck-icon"><UiIcon name={deckIcon(deck)} size={42} /></div><div><h3 {...stylex.attrs(s.dashboardDeckTitle)} data-deez="deck-title">{deck.name}</h3><p {...stylex.attrs(s.dashboardDeckMeta)} data-deez="deck-meta">{deck.due_count} due · {deck.card_count} cards</p><div {...stylex.attrs(s.chipRow)}><span {...stylex.attrs(s.chip, s.chipPink)} data-deez="chip" data-accent="true">{deckTag(deck)}</span><span {...stylex.attrs(s.chip)} data-deez="chip">PRIVATE</span></div></div><span {...stylex.attrs(s.deckArrow)} data-deez="deck-arrow"><UiIcon name="chevron" size={26} /></span></a>}
        </For>
      </div>
      <section {...stylex.attrs(s.statsPanel)} data-deez="stats" aria-label="Library summary">
        <div {...stylex.attrs(s.statItem)} data-deez="stat"><UiIcon name="bolt" size={42} class="stat-glyph" /><div><p {...stylex.attrs(s.statNumber)} data-deez="stat-number">{due()}</p><div {...stylex.attrs(s.statLabel)} data-deez="stat-label">Due today</div></div></div>
        <div {...stylex.attrs(s.statItem)} data-deez="stat"><UiIcon name="layers" size={42} class="stat-glyph" /><div><p {...stylex.attrs(s.statNumber)} data-deez="stat-number">{decks().length}</p><div {...stylex.attrs(s.statLabel)} data-deez="stat-label">Active decks</div></div></div>
        <div {...stylex.attrs(s.statItem)} data-deez="stat"><UiIcon name="bars" size={42} class="stat-glyph" /><div><p {...stylex.attrs(s.statNumber)} data-deez="stat-number">{totalCards()}</p><div {...stylex.attrs(s.statLabel)} data-deez="stat-label">Total cards</div></div></div>
        <div {...stylex.attrs(s.statItem)} data-deez="stat"><UiIcon name="calendar" size={42} class="stat-glyph" /><div><p {...stylex.attrs(s.statNumber)} data-deez="stat-number">{studiedToday()}</p><div {...stylex.attrs(s.statLabel)} data-deez="stat-label">Studied today</div></div></div>
      </section>
    </div>
  </AppShell>;
}
