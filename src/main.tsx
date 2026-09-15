import { render } from "@solidjs/web";
import App from "./App";
import { replicateNow, replicationStatus } from "./localReplication";
import "./reset.css";
import "./neoRetro.css";
import "./neoRetroPublic.css";
import "./layoutRefine.css";
import "./reliabilityUx.css";
import "./studyCompleteness.css";

function forceStudyDocumentNavigation(event: MouseEvent) {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.altKey || event.ctrlKey || event.shiftKey) return;
  const anchor = event.composedPath().find((node) => node instanceof HTMLAnchorElement) as HTMLAnchorElement | undefined;
  if (!anchor || anchor.target || anchor.hasAttribute("download")) return;
  const url = new URL(anchor.href, window.location.href);
  if (url.origin !== window.location.origin || !/^\/app\/decks\/[^/]+\/study$/.test(url.pathname)) return;
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

void pushPendingIfNeeded().catch((reason) => console.warn("Pending Deez replication will retry later", reason));
window.addEventListener("online", () => {
  void pushPendingIfNeeded().catch((reason) => console.warn("Pending Deez replication will retry later", reason));
});
