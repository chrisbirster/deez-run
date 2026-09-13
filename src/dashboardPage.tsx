import { For, Show, createSignal } from "solid-js";
import * as stylex from "@stylexjs/stylex";
import { appApi, type Deck } from "./appApi";
import { AppShell } from "./appChrome";
import { appStyles as s } from "./appStyles.stylex";
import { Seo } from "./seo";

function message(reason: unknown) {
  return reason instanceof Error ? reason.message : "Something went wrong.";
}

function deckIcon(deck: Deck) {
  const name = deck.name.toLowerCase();
  if (name.includes("aws") || name.includes("cloud")) return "☁";
  if (name.includes("ssh") || name.includes("linux") || name.includes("terminal")) return ">_";
  return "▱";
}

function deckTag(deck: Deck) {
  const name = deck.name.toLowerCase();
  if (name.includes("aws") || name.includes("cloud")) return "CLOUD";
  if (name.includes("ssh") || name.includes("linux") || name.includes("terminal")) return "TECH";
  return "DECK";
}

export function DashboardPage() {
  const [decks, setDecks] = createSignal<Deck[]>([]);
  const [error, setError] = createSignal<string>();

  void appApi.listDecks().then(setDecks).catch((reason) => setError(message(reason)));

  const dueDecks = () => decks().filter((deck) => deck.due_count > 0).sort((a, b) => b.due_count - a.due_count);
  const due = () => decks().reduce((sum, deck) => sum + deck.due_count, 0);
  const totalCards = () => decks().reduce((sum, deck) => sum + deck.card_count, 0);
  const studyHref = () => dueDecks()[0] ? `/app/decks/${dueDecks()[0].id}/study` : "/app/decks";

  return (
    <AppShell>
      <Seo title="My Deez" description="Your synced Deez study queue." path="/app" noindex />
      <div {...stylex.attrs(s.dashboard)}>
        <Show when={error()}>{(value) => <div {...stylex.attrs(s.error)}>{value()}</div>}</Show>

        <section {...stylex.attrs(s.dashboardHero)}>
          <div {...stylex.attrs(s.heroGrid)} />
          <div {...stylex.attrs(s.heroCopy)}>
            <p {...stylex.attrs(s.heroKicker)}>Today</p>
            <div {...stylex.attrs(s.heroTitleRow)}>
              <h1 {...stylex.attrs(s.heroNumber)}>{due()}</h1>
              <h2 {...stylex.attrs(s.heroTitle)}>cards due</h2>
            </div>
            <p {...stylex.attrs(s.heroSub)}>Time to build a sharper you.</p>
          </div>

          <div {...stylex.attrs(s.heroVisual)} aria-hidden="true">
            <div {...stylex.attrs(s.heroSun)} />
            <div {...stylex.attrs(s.mountainBack)} />
            <div {...stylex.attrs(s.mountainFront)} />
            <div {...stylex.attrs(s.horizon)} />
          </div>

          <div {...stylex.attrs(s.studyButtonWrap)}>
            <a {...stylex.attrs(s.studyButton)} href={studyHref()}>▶&nbsp;&nbsp; Study now &nbsp;→</a>
          </div>
        </section>

        <div {...stylex.attrs(s.sectionHeader)}>
          <span {...stylex.attrs(s.sectionLabel)}>Due today</span>
          <a {...stylex.attrs(s.subtleLink)} href="/app/decks">View all nuts&nbsp; →</a>
        </div>

        <div {...stylex.attrs(s.dashboardDeckGrid)}>
          <For each={dueDecks()} fallback={<div {...stylex.attrs(s.panel)}><strong>You’re caught up.</strong><p {...stylex.attrs(s.muted)}>No cards are due right now.</p></div>}>
            {(deck) => (
              <a {...stylex.attrs(s.dashboardDeckCard)} href={`/app/decks/${deck.id}/study`}>
                <div {...stylex.attrs(s.deckIconBox)}>{deckIcon(deck)}</div>
                <div>
                  <h3 {...stylex.attrs(s.dashboardDeckTitle)}>{deck.name}</h3>
                  <p {...stylex.attrs(s.dashboardDeckMeta)}>{deck.due_count} due · {deck.card_count} cards</p>
                  <div {...stylex.attrs(s.chipRow)}>
                    <span {...stylex.attrs(s.chip, s.chipPink)}>{deckTag(deck)}</span>
                    <span {...stylex.attrs(s.chip)}>PRIVATE</span>
                  </div>
                </div>
                <span {...stylex.attrs(s.deckArrow)}>›</span>
              </a>
            )}
          </For>
        </div>

        <section {...stylex.attrs(s.statsPanel)} aria-label="Library summary">
          <div {...stylex.attrs(s.statItem)}>
            <p {...stylex.attrs(s.statNumber)}>{due()}</p>
            <div {...stylex.attrs(s.statLabel)}>Due today</div>
          </div>
          <div {...stylex.attrs(s.statItem)}>
            <p {...stylex.attrs(s.statNumber)}>{decks().length}</p>
            <div {...stylex.attrs(s.statLabel)}>Active decks</div>
          </div>
          <div {...stylex.attrs(s.statItem)}>
            <p {...stylex.attrs(s.statNumber)}>{totalCards()}</p>
            <div {...stylex.attrs(s.statLabel)}>Total cards</div>
          </div>
          <div {...stylex.attrs(s.statItem)}>
            <p {...stylex.attrs(s.statNumber)}>LIVE</p>
            <div {...stylex.attrs(s.statLabel)}>Cloud library</div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
