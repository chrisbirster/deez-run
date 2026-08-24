import { createRouter } from "@solidjs/router";
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

export const Router = createRouter({
  routes: [
    { path: "/", component: HomePage },
    { path: "/nuts", component: NutsPage },
    { path: "/nuts/:slug", component: NutPage },
    { path: "/authors/:author", component: AuthorPage },
    { path: "/search", component: SearchPage },
    { path: "/docs", component: DocsPage },
    { path: "/publish", component: PublishPage },
    { path: "*404", component: NotFoundPage },
  ],
});

export const { paths } = Router;
