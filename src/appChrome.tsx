import { Show, createSignal, type ParentProps } from "solid-js";
import * as stylex from "@stylexjs/stylex";
import { ApiError, appApi, type User } from "./appApi";
import { appStyles as s } from "./appStyles.stylex";
import { UiIcon } from "./uiIcons";

function message(reason: unknown) {
  return reason instanceof Error ? reason.message : "Something went wrong.";
}

function initials(username?: string | null) {
  const value = (username ?? "dz").replace(/[^a-z0-9]/gi, "").slice(0, 2);
  return (value || "dz").toUpperCase();
}

function active(path: string) {
  const current = window.location.pathname;
  if (path === "/app") return current === "/app";
  if (path === "/nuts") return current === "/nuts" || current.startsWith("/nuts/");
  return current.startsWith(path);
}

export function AppSidebar(props: { user?: User; loading?: boolean }) {
  return (
    <aside {...stylex.attrs(s.side)} data-deez="sidebar">
      <Show when={props.user} fallback={<p {...stylex.attrs(s.muted)}>{props.loading === false ? "Your Deez" : "Connecting…"}</p>}>
        {(current) => (
          <div {...stylex.attrs(s.profileBlock)} data-deez="profile">
            <div {...stylex.attrs(s.avatar)} data-deez="profile-avatar">{initials(current().username)}</div>
            <div>
              <div {...stylex.attrs(s.profileName)} data-deez="profile-name">@{current().username ?? "new-user"}</div>
              <span {...stylex.attrs(s.planBadge)} data-deez="plan">FREE</span>
            </div>
          </div>
        )}
      </Show>

      <nav {...stylex.attrs(s.sideNav)} data-deez="side-nav" aria-label="My Deez">
        <a {...stylex.attrs(s.sideLink, active("/app") && s.sideLinkActive)} data-deez="side-link" data-active={active("/app") ? "true" : "false"} href="/app"><UiIcon name="home" /> <span>Today</span></a>
        <a {...stylex.attrs(s.sideLink, active("/app/decks") && s.sideLinkActive)} data-deez="side-link" data-active={active("/app/decks") ? "true" : "false"} href="/app/decks"><UiIcon name="card" /> <span>My nuts</span></a>
        <a {...stylex.attrs(s.sideLink, active("/app/settings") && s.sideLinkActive)} data-deez="side-link" data-active={active("/app/settings") ? "true" : "false"} href="/app/settings"><UiIcon name="settings" /> <span>Settings</span></a>
        <a {...stylex.attrs(s.sideLink, active("/nuts") && s.sideLinkActive)} data-deez="side-link" data-active={active("/nuts") ? "true" : "false"} href="/nuts"><UiIcon name="globe" /> <span>Public nuts</span></a>
      </nav>

      <div {...stylex.attrs(s.quoteCard)} data-deez="quote" aria-hidden="true">
        <div {...stylex.attrs(s.quoteText)} data-deez="quote-text">“Small cards.<br />Big progress.”</div>
        <div {...stylex.attrs(s.quoteByline)} data-deez="quote-byline">— deez.run</div>
      </div>
    </aside>
  );
}

export function AppShell(props: ParentProps) {
  const [user, setUser] = createSignal<User>();
  const [authError, setAuthError] = createSignal<string>();

  void appApi.me().then((value) => {
    setUser(value);
    if (!value.username && window.location.pathname !== "/app/onboarding") {
      window.location.assign("/app/onboarding");
    }
  }).catch((reason) => {
    if (reason instanceof ApiError && reason.status === 401) {
      window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname)}`);
      return;
    }
    setAuthError(message(reason));
  });

  return (
    <div {...stylex.attrs(s.appShell)} data-deez="app-shell">
      <AppSidebar user={user()} loading={!authError()} />

      <div {...stylex.attrs(s.main)} data-deez="main">
        <Show when={authError()}>{(value) => <div {...stylex.attrs(s.error)}>{value()}</div>}</Show>
        {props.children}
      </div>
    </div>
  );
}
