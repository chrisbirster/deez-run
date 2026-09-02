import { render } from "@solidjs/web";
import App from "./App";
import { replicateNow, startReplication } from "./localReplication";
import "./reset.css";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root mount point");

render(() => <App />, root);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js").catch((reason) => console.warn("Deez service worker failed to register", reason));
  });
}

void startReplication().catch((reason) => console.warn("Initial Deez replication will retry later", reason));
window.addEventListener("online", () => {
  void replicateNow().catch((reason) => console.warn("Deez replication will retry later", reason));
});
