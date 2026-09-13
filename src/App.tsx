import { Show, createSignal, type ParentProps } from "solid-js";
import { useLocation } from "@solidjs/router";
import * as stylex from "@stylexjs/stylex";
import { appApi, type User } from "./appApi";
import { AppSidebar } from "./appChrome";
import { Router } from "./router";
import { styles } from "./siteStyles";
import { UiIcon } from "./uiIcons";

function initials(username?: string | null) {
  const value = (username ?? "dz").replace(/[^a-z0-9]/gi, "").slice(0, 2);
  return (value || "dz").toUpperCase();
}

function topActive(path: string, current: string) {
  if (path === "/nuts") return current === "/nuts" || current.startsWith("/nuts/");
  if (path === "/app") return current.startsWith("/app");
  return current === path || current.startsWith(`${path}/`);
}

function Layout(props: ParentProps) {
  const location = useLocation();
  const [user, setUser] = createSignal<User>();
  const [authResolved, setAuthResolved] = createSignal(false);

  void appApi.me().then(setUser).catch(() => undefined).finally(() => setAuthResolved(true));

  const appRoute = () => location.pathname.startsWith("/app");
  const authRoute = () => location.pathname === "/login" || location.pathname.startsWith("/auth/");
  const usePublicSidebar = () => Boolean(user()) && !appRoute() && !authRoute();

  const nav = [
    ["/nuts", "layers", "Nuts"],
    ["/search", "search", "Search"],
    ["/docs", "book", "Docs"],
    ["/publish", "rocket", "Publish"],
    ["/app", "card", "My Deez"],
    ["/app/offline", "offline", "Offline"],
    ["/app/tools", "tools", "Tools"],
  ] as const;

  return (
    <div {...stylex.attrs(styles.page)} data-deez="page">
      <div {...stylex.attrs(styles.shell)} data-deez="shell">
        <header {...stylex.attrs(styles.header)} data-deez="header">
          <a {...stylex.attrs(styles.brand)} data-deez="brand" href="/" aria-label="deez.run home">deez.run</a>

          <nav {...stylex.attrs(styles.nav)} data-deez="topnav" aria-label="Primary navigation">
            {nav.map(([href, icon, label]) => (
              <a {...stylex.attrs(styles.navLink)} data-deez="navlink" data-active={topActive(href, location.pathname) ? "true" : "false"} href={href}>
                <UiIcon name={icon} />
                <span>{label}</span>
              </a>
            ))}

            <Show when={user()} fallback={<Show when={authResolved()}><a {...stylex.attrs(styles.navLink)} data-deez="navlink" href="/login">Sign in</a></Show>}>
              {(current) => (
                <a {...stylex.attrs(styles.accountLink)} data-deez="account" href="/app/settings" aria-label="Account settings">
                  <span {...stylex.attrs(styles.accountAvatar)} data-deez="account-avatar">{initials(current().username)}</span>
                  <span {...stylex.attrs(styles.accountName)} data-deez="account-name">@{current().username ?? "new-user"}</span>
                  <span aria-hidden="true">▾</span>
                </a>
              )}
            </Show>
          </nav>
        </header>

        <Show when={usePublicSidebar()} fallback={<main data-deez="route-main">{props.children}</main>}>
          <main data-deez="public-shell">
            <AppSidebar user={user()} loading={!authResolved()} />
            <div data-deez="public-content">{props.children}</div>
          </main>
        </Show>

        <footer {...stylex.attrs(styles.footer)} data-deez="footer">
          <div><strong>deez.run</strong>&nbsp;&nbsp;│&nbsp;&nbsp;Flashcards for a sharper you.</div>
          <div>Learn&nbsp;&nbsp; · &nbsp;&nbsp;Remember&nbsp;&nbsp; · &nbsp;&nbsp;Build&nbsp;&nbsp; · &nbsp;&nbsp;Repeat</div>
        </footer>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Router>
      {(props) => <Layout>{props.children}</Layout>}
    </Router>
  );
}
