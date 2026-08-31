import type { ParentProps } from "solid-js";
import * as stylex from "@stylexjs/stylex";
import { Router } from "./router";
import { styles } from "./siteStyles";

function Layout(props: ParentProps) {
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
            <a {...stylex.attrs(styles.navLink)} href="/login">Sign in</a>
          </nav>
        </header>
        <main>{props.children}</main>
        <footer {...stylex.attrs(styles.footer)}>
          <p>Deez on the web, powered by the same Zig core.</p>
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
