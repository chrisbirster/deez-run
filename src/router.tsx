import { createRouter } from "@solidjs/router";
import {
  AppHomePage,
  DeckPage as MyDeckPage,
  DecksPage as MyDecksPage,
  LoginPage,
  MagicLinkPage,
  NoteEditorPage,
  OnboardingPage,
  SettingsPage,
} from "./appPages";
import { OfflineLibraryPage, OfflineStudyPage } from "./offlinePages";
import { CardInspectPage, DeckCardsPage, ToolsPage } from "./parityPages";
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
    { path: "/app", component: AppHomePage },
    { path: "/app/onboarding", component: OnboardingPage },
    { path: "/app/decks", component: MyDecksPage },
    { path: "/app/decks/:deckId", component: MyDeckPage },
    { path: "/app/decks/:deckId/notes/new", component: NoteEditorPage },
    { path: "/app/decks/:deckId/notes/:noteId", component: NoteEditorPage },
    { path: "/app/decks/:deckId/study", component: HostedStudyPage },
    { path: "/app/decks/:deckId/cards", component: DeckCardsPage },
    { path: "/app/cards/:cardId", component: CardInspectPage },
    { path: "/app/offline", component: OfflineLibraryPage },
    { path: "/app/offline/:deckId", component: OfflineStudyPage },
    { path: "/app/tools", component: ToolsPage },
    { path: "/app/settings", component: SettingsPage },
    { path: "*404", component: NotFoundPage },
  ],
});

export const { paths } = Router;
