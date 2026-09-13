import { Show, createSignal, type ParentProps } from "solid-js";
import * as stylex from "@stylexjs/stylex";
import { appApi, type User } from "./appApi";
import { Router } from "./router";
import { styles } from "./siteStyles";

function initials(username?: string | null) {
  const value = (username ?? "dz").replace(/[^a-z0-9]/gi, "").slice(0, 2);
  return (value || "dz").toUpperCase();
}

function Layout(props: ParentProps) {
  const [user, setUser] = createSignal<User>();
  const [authResolved, setAuthResolved] = createSignal(false);

  void appApi.me().then(setUser).catch(() => undefined).finally(() => setAuthResolved(true));

  return (
    <div {...stylex.attrs(styles.page)}>
      <div {...stylex.attrs(styles.shell)}>
        <header {...stylex.attrs(styles.header)}>
          <a {...stylex.attrs(styles.brand)} href="/" aria-label="deez.run home">
            <span {...stylex.attrs(styles.brandMark)}>dz</span>
            <span>deez.run</span>
          </a>

          <nav {...stylex.attrs(styles.nav)} aria-label="Primary navigation">
            <a {...stylex.attrs(styles.navLink)} href="/nuts">Nuts</a>
            <a {...stylex.attrs(styles.navLink)} href="/search">Search</a>
            <a {...stylex.attrs(styles.navLink)} href="/docs">Docs</a>
            <a {...stylex.attrs(styles.navLink)} href="/publish">Publish</a>
            <a {...stylex.attrs(styles.navLink)} href="/app">My Deez</a>
            <a {...stylex.attrs(styles.navLink)} href="/app/offline">Offline</a>
            <a {...stylex.attrs(styles.navLink)} href="/app/tools">Tools</a>

            <Show when={user()} fallback={<Show when={authResolved()}><a {...stylex.attrs(styles.navLink)} href="/login">Sign in</a></Show>}>
              {(current) => (
                <a {...stylex.attrs(styles.accountLink)} href="/app/settings" aria-label="Account settings">
                  <span {...stylex.attrs(styles.accountAvatar)}>{initials(current().username)}</span>
                  <span {...stylex.attrs(styles.accountName)}>@{current().username ?? "new-user"}</span>
                  <span aria-hidden="true">▾</span>
                </a>
              )}
            </Show>
          </nav>
        </header>

        <main>{props.children}</main>

        <footer {...stylex.attrs(styles.footer)}>
          <p>deez.run · flashcards for a sharper you.</p>
          <a href="https://github.com/chrisbirster/deez-run">Source</a>
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
