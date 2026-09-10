import { render } from "@solidjs/web";
import App from "./App";
import { replicateNow, replicationStatus } from "./localReplication";
import "./reset.css";

function forceStudyDocumentNavigation(event: MouseEvent) {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.altKey ||
    event.ctrlKey ||
    event.shiftKey
  ) return;

  const anchor = event.composedPath().find((node) => node instanceof HTMLAnchorElement) as HTMLAnchorElement | undefined;
  if (!anchor || anchor.target || anchor.hasAttribute("download")) return;

  const url = new URL(anchor.href, window.location.href);
  if (url.origin !== window.location.origin || !/^\/app\/decks\/[^/]+\/study$/.test(url.pathname)) return;

  // Study deliberately receives a narrower document CSP that permits only
  // WebAssembly compilation. Force a real navigation so the browser applies
  // that response policy instead of carrying the previous SPA document CSP.
  event.preventDefault();
  window.location.assign(url.href);
}

async function pushPendingIfNeeded() {
  if (!navigator.onLine) return;
  const status = await replicationStatus();
  if (status.pending > 0) await replicateNow();
}

document.addEventListener("click", forceStudyDocumentNavigation, { capture: true });

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root mount point");

render(() => <App />, root);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js").catch((reason) => console.warn("Deez service worker failed to register", reason));
  });
}

// Online account reads come directly from the signed-in cloud library. Do not
// start a multi-thousand-record IndexedDB hydration on every page load; only
// replay durable local mutations automatically. Full offline hydration remains
// an explicit action on the sync/offline screens.
void pushPendingIfNeeded().catch((reason) => console.warn("Pending Deez replication will retry later", reason));
window.addEventListener("online", () => {
  void pushPendingIfNeeded().catch((reason) => console.warn("Pending Deez replication will retry later", reason));
});
