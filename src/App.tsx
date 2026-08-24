import type { ParentProps } from "solid-js";
import "./styles.css";
import { Router } from "./router";

function Layout(props: ParentProps) {
  return (
    <div class="site-shell">
      <header class="site-header">
        <a class="brand" href="/" aria-label="deez.run home">
          <span class="brand-mark">dz</span>
          <span>deez.run</span>
        </a>
        <nav aria-label="Primary navigation">
          <a href="/nuts">Nuts</a>
          <a href="/search">Search</a>
          <a href="/docs">Docs</a>
          <a href="/publish">Publish</a>
        </nav>
      </header>
      <main>{props.children}</main>
      <footer class="site-footer">
        <p>Public discovery for Deez. Your local study database stays local.</p>
        <a href="https://github.com/chrisbirster/deez-run">Source</a>
      </footer>
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
