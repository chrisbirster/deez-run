import { Show, createSignal, type ParentProps } from "solid-js";
import * as stylex from "@stylexjs/stylex";
import { ApiError, appApi, type User } from "./appApi";
import { appStyles as s } from "./appStyles.stylex";

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
  return current.startsWith(path);
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
    <div {...stylex.attrs(s.appShell)}>
      <aside {...stylex.attrs(s.side)}>
        <Show when={user()} fallback={<p {...stylex.attrs(s.muted)}>Connecting…</p>}>
          {(current) => (
            <div {...stylex.attrs(s.profileBlock)}>
              <div {...stylex.attrs(s.avatar)}>{initials(current().username)}</div>
              <div>
                <div {...stylex.attrs(s.profileName)}>@{current().username ?? "new-user"}</div>
                <span {...stylex.attrs(s.planBadge)}>FREE</span>
              </div>
            </div>
          )}
        </Show>

        <nav {...stylex.attrs(s.sideNav)} aria-label="My Deez">
          <a {...stylex.attrs(s.sideLink, active("/app") && s.sideLinkActive)} href="/app">Today</a>
          <a {...stylex.attrs(s.sideLink, active("/app/decks") && s.sideLinkActive)} href="/app/decks">My nuts</a>
          <a {...stylex.attrs(s.sideLink, active("/app/settings") && s.sideLinkActive)} href="/app/settings">Settings</a>
          <a {...stylex.attrs(s.sideLink)} href="/nuts">Public nuts</a>
        </nav>

        <div {...stylex.attrs(s.quoteCard)} aria-hidden="true">
          <div {...stylex.attrs(s.quoteText)}>“Small cards.<br />Big progress.”</div>
          <div {...stylex.attrs(s.quoteByline)}>— deez.run</div>
        </div>
      </aside>

      <div {...stylex.attrs(s.main)}>
        <Show when={authError()}>{(value) => <div {...stylex.attrs(s.error)}>{value()}</div>}</Show>
        {props.children}
      </div>
    </div>
  );
}
