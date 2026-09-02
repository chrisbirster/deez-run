import { render } from "@solidjs/web";
import App from "./App";
import { flushOfflineReviews } from "./offline";
import "./reset.css";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root mount point");

render(() => <App />, root);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js").catch((reason) => console.warn("Deez offline worker failed to register", reason));
  });
}

async function flushReviews() {
  try { await flushOfflineReviews(); }
  catch (reason) { console.warn("Deez offline review sync will retry later", reason); }
}

if (navigator.onLine) void flushReviews();
window.addEventListener("online", () => void flushReviews());
