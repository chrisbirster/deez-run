import { createRouter } from "@solidjs/router";
import {
  LoginPage,
  MagicLinkPage,
  NoteEditorPage,
  OnboardingPage,
  SettingsPage,
} from "./appPages";
import { DashboardPage } from "./dashboardPage";
import { DeckPage as MyDeckPage } from "./deckPage";
import { LocalFirstStatusPage } from "./localFirstPages";
import { CardInspectPage, DeckCardsPage } from "./parityPages";
import { ToolsPage } from "./toolsPage";
import {
  AuthorPage,
  DocsPage,
  HomePage,
  NotFoundPage,
  NutPage,
  NutsPage,
  PublishPage,
  SearchPage,
} from "./pages";
import { HostedStudyPage } from "./studyPage";
import { SyncedDecksPage } from "./syncedDecksPage";

export const Router = createRouter({
  routes: [
    { path: "/", component: HomePage },
    { path: "/nuts", component: NutsPage },
    { path: "/nuts/:slug", component: NutPage },
    { path: "/authors/:author", component: AuthorPage },
    { path: "/search", component: SearchPage },
    { path: "/docs", component: DocsPage },
    { path: "/publish", component: PublishPage },
    { path: "/login", component: LoginPage },
    { path: "/auth/magic", component: MagicLinkPage },
    { path: "/app", component: DashboardPage },
    { path: "/app/onboarding", component: OnboardingPage },
    { path: "/app/decks", component: SyncedDecksPage },
    { path: "/app/decks/:deckId", component: MyDeckPage },
    { path: "/app/decks/:deckId/notes/new", component: NoteEditorPage },
    { path: "/app/decks/:deckId/notes/:noteId", component: NoteEditorPage },
    { path: "/app/decks/:deckId/study", component: HostedStudyPage },
    { path: "/app/decks/:deckId/cards", component: DeckCardsPage },
    { path: "/app/cards/:cardId", component: CardInspectPage },
    { path: "/app/offline", component: LocalFirstStatusPage },
    { path: "/app/offline/:deckId", component: LocalFirstStatusPage },
    { path: "/app/tools", component: ToolsPage },
    { path: "/app/settings", component: SettingsPage },
    { path: "*404", component: NotFoundPage },
  ],
});

export const { paths } = Router;
