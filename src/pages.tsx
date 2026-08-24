import { For, Show } from "solid-js";
import { useParams, useSearchParams } from "@solidjs/router";
import {
  catalog,
  findNut,
  formatBytes,
  nutsByAuthor,
  searchNuts,
  type CatalogEntry,
} from "./lib/catalog";
import { Seo } from "./seo";

function NutCard(props: { nut: CatalogEntry }) {
  return (
    <article class="nut-card">
      <div class="eyebrow">
        {props.nut.latest.note_count} notes · {props.nut.latest.card_count} cards
      </div>
      <h2>
        <a href={`/nuts/${props.nut.slug}`}>{props.nut.name}</a>
      </h2>
      <p>{props.nut.description}</p>
      <div class="tag-row">
        <For each={props.nut.tags}>{(tag) => <span class="tag">{tag}</span>}</For>
      </div>
      <p class="muted">
        by{" "}
        <For each={props.nut.authors} fallback={<span>unknown</span>}>
          {(author, index) => (
            <>
              <Show when={index() > 0}>, </Show>
              <a href={`/authors/${author.github}`}>{author.name ?? author.github}</a>
            </>
          )}
        </For>
      </p>
    </article>
  );
}

function EmptyCatalog() {
  return (
    <div class="empty-state">
      <h2>The registry is ready for its first nut.</h2>
      <p>
        Deck content stays in the author's GitHub repository. deez.run only indexes
        validated, checksum-pinned metadata.
      </p>
      <a class="button" href="/publish">Read the publishing workflow</a>
    </div>
  );
}

export function HomePage() {
  return (
    <>
      <Seo
        title="deez.run"
        description="Discover, inspect, and download public Deez .nut flashcard decks while keeping your study database local."
        path="/"
      />
      <section class="hero">
        <div>
          <p class="eyebrow">Public Deez catalog</p>
          <h1>Find a nut. Learn it locally.</h1>
          <p class="lede">
            deez.run discovers public `.nut` decks without becoming your flashcard
            database. Browse here, download from the author, study in local Deez.
          </p>
          <form class="search-box" action="/search" method="get">
            <label class="sr-only" for="home-search">Search public nuts</label>
            <input id="home-search" name="q" type="search" placeholder="Search data structures, Zig, MongoDB…" />
            <button type="submit">Search</button>
          </form>
        </div>
        <aside class="flow-card" aria-label="How deez.run works">
          <code>deez.run</code>
          <span>↓ registry metadata</span>
          <code>github.com/author/deck</code>
          <span>↓ pinned .nut + SHA-256</span>
          <code>deez nut import deck.nut</code>
        </aside>
      </section>

      <section class="section">
        <div class="section-heading">
          <div>
            <p class="eyebrow">Registry</p>
            <h2>Public nuts</h2>
          </div>
          <a href="/nuts">Browse all</a>
        </div>
        <Show when={catalog.length > 0} fallback={<EmptyCatalog />}>
          <div class="card-grid">
            <For each={catalog.slice(0, 6)}>{(nut) => <NutCard nut={nut} />}</For>
          </div>
        </Show>
      </section>
    </>
  );
}

export function NutsPage() {
  return (
    <section class="section narrow-top">
      <Seo
        title="Public nuts"
        description="Browse validated public Deez .nut decks with immutable GitHub source pins and SHA-256 checksums."
        path="/nuts"
      />
      <p class="eyebrow">Browse</p>
      <h1>Public nuts</h1>
      <p class="lede">Validated metadata and immutable GitHub source pins. No account required.</p>
      <Show when={catalog.length > 0} fallback={<EmptyCatalog />}>
        <div class="card-grid">
          <For each={catalog}>{(nut) => <NutCard nut={nut} />}</For>
        </div>
      </Show>
    </section>
  );
}

export function SearchPage() {
  const [params] = useSearchParams();
  const query = () => String(params.q ?? "");
  const results = () => searchNuts(query());

  return (
    <section class="section narrow-top">
      <Seo
        title={query() ? `Search: ${query()}` : "Search"}
        description="Search public Deez nuts by name, description, tag, author, or note type."
        path={query() ? `/search?q=${encodeURIComponent(query())}` : "/search"}
        noindex
      />
      <p class="eyebrow">Search</p>
      <h1>Search the registry</h1>
      <form class="search-box search-page" action="/search" method="get">
        <label class="sr-only" for="search-query">Search public nuts</label>
        <input id="search-query" name="q" type="search" value={query()} placeholder="Search by name, tag, author, or note type" />
        <button type="submit">Search</button>
      </form>
      <p class="muted">{results().length} result{results().length === 1 ? "" : "s"}{query() ? ` for “${query()}”` : ""}</p>
      <Show when={results().length > 0} fallback={<EmptyCatalog />}>
        <div class="card-grid">
          <For each={results()}>{(nut) => <NutCard nut={nut} />}</For>
        </div>
      </Show>
    </section>
  );
}

export function NutPage() {
  const params = useParams();
  const nut = () => findNut(String(params.slug ?? ""));

  return (
    <Show when={nut()} fallback={<NotFoundPage />}>
      {(entry) => {
        const item = entry();
        const latest = item.latest;
        const fileName = `${item.slug}.nut`;
        const install = `curl -L '${latest.raw_url}' -o '${fileName}'\necho '${latest.sha256}  ${fileName}' | shasum -a 256 -c -\ndeez nut import '${fileName}'`;
        return (
          <article class="section nut-detail narrow-top">
            <Seo title={item.name} description={item.description} path={`/nuts/${item.slug}`} />
            <p class="eyebrow">Nut · v{latest.version}</p>
            <h1>{item.name}</h1>
            <p class="lede">{item.description}</p>
            <div class="tag-row">
              <For each={item.tags}>{(tag) => <span class="tag">{tag}</span>}</For>
            </div>

            <div class="detail-grid">
              <section class="panel">
                <h2>Deck details</h2>
                <dl class="facts">
                  <div><dt>Author</dt><dd><For each={item.authors}>{(author) => <a href={`/authors/${author.github}`}>{author.name ?? author.github}</a>}</For></dd></div>
                  <div><dt>Notes</dt><dd>{latest.note_count}</dd></div>
                  <div><dt>Cards</dt><dd>{latest.card_count}</dd></div>
                  <div><dt>Format</dt><dd>{latest.nut_format} v{latest.nut_version}</dd></div>
                  <div><dt>Size</dt><dd>{formatBytes(latest.size_bytes)}</dd></div>
                  <div><dt>License</dt><dd>{item.license ?? "Not declared"}</dd></div>
                  <div><dt>Note types</dt><dd>{latest.note_types.join(", ") || "None"}</dd></div>
                </dl>
              </section>

              <section class="panel">
                <h2>Immutable source</h2>
                <p><a href={`https://github.com/${item.source.repository}`}>{item.source.repository}</a></p>
                <p class="mono-wrap"><strong>Commit</strong><br />{latest.commit}</p>
                <p class="mono-wrap"><strong>Path</strong><br />{latest.path}</p>
                <p class="mono-wrap"><strong>SHA-256</strong><br />{latest.sha256}</p>
                <div class="button-row">
                  <a class="button" href={latest.raw_url}>Download .nut</a>
                  <a class="button secondary" href={latest.source_url}>View source</a>
                </div>
              </section>
            </div>

            <section class="panel preview-panel">
              <div class="section-heading">
                <div><p class="eyebrow">Safe preview</p><h2>Sample notes</h2></div>
                <span class="muted">Rendered as text, never user HTML</span>
              </div>
              <Show when={latest.preview.length > 0} fallback={<p>No notes in this deck.</p>}>
                <div class="preview-list">
                  <For each={latest.preview}>
                    {(note) => (
                      <article class="preview-note">
                        <div class="eyebrow">{note.note_type}</div>
                        <For each={note.fields}>{(field, index) => <p><strong>Field {index() + 1}:</strong> {field}</p>}</For>
                        <Show when={note.tags.length > 0}><p class="muted">Tags: {note.tags.join(", ")}</p></Show>
                      </article>
                    )}
                  </For>
                </div>
              </Show>
            </section>

            <section class="panel">
              <p class="eyebrow">Install locally</p>
              <h2>Download, verify, import</h2>
              <p>This uses the exact commit registered above. deez.run is not in the import path.</p>
              <pre><code>{install}</code></pre>
            </section>
          </article>
        );
      }}
    </Show>
  );
}

export function AuthorPage() {
  const params = useParams();
  const author = () => String(params.author ?? "");
  const entries = () => nutsByAuthor(author());
  return (
    <section class="section narrow-top">
      <Seo
        title={`@${author()}`}
        description={`Public Deez nuts published by GitHub author @${author()}.`}
        path={`/authors/${author()}`}
      />
      <p class="eyebrow">Author</p>
      <h1>@{author()}</h1>
      <p><a href={`https://github.com/${author()}`}>View GitHub profile</a></p>
      <Show when={entries().length > 0} fallback={<p>No registered nuts for this author.</p>}>
        <div class="card-grid"><For each={entries()}>{(nut) => <NutCard nut={nut} />}</For></div>
      </Show>
    </section>
  );
}

export function DocsPage() {
  return (
    <section class="section prose narrow-top">
      <Seo
        title="Docs"
        description="Learn how the deez.run public registry, .nut decks, .sack packages, checksums, and local Deez imports fit together."
        path="/docs"
      />
      <p class="eyebrow">Docs</p>
      <h1>How deez.run fits Deez</h1>
      <p>deez.run is a public discovery layer, not the authoritative study database. Deez remains local-first and usable without an account.</p>
      <h2>.nut</h2>
      <p>A `.nut` v2 file is newline-delimited JSON: one deck header followed by logical note records. It contains shareable deck content, not review history or scheduler state.</p>
      <h2>.sack</h2>
      <p>A `.sack` is the ZIP-compatible rich-media transport for a `.nut` plus content-addressed media. The first deez.run milestone indexes textual `.nut` files only; large media hosting is intentionally deferred.</p>
      <h2>Trust model</h2>
      <p>Registry versions pin a full Git commit and SHA-256 of the exact `.nut` bytes. Public previews treat fields as untrusted text. A registry listing is not permission to execute content.</p>
      <h2>Local import</h2>
      <pre><code>deez nut import deck.nut</code></pre>
      <p>Future CLI discovery can query the same generated catalog, but local Deez never needs deez.run to study existing decks.</p>
    </section>
  );
}

export function PublishPage() {
  return (
    <section class="section prose narrow-top">
      <Seo
        title="Publish"
        description="Publish a public Deez .nut through the GitHub-backed deez.run registry using immutable commit pins and SHA-256 verification."
        path="/publish"
      />
      <p class="eyebrow">Publish</p>
      <h1>Publish a public nut</h1>
      <p>The initial workflow is intentionally GitHub- and PR-based. deez.run does not mutate your GitHub account.</p>
      <ol>
        <li>Put the `.nut` in a public GitHub repository and commit it.</li>
        <li>Use the full 40-character commit SHA, not a mutable branch name.</li>
        <li>Calculate SHA-256 over the exact `.nut` bytes at that commit.</li>
        <li>Add or update one registry entry under <code>registry/nuts/</code>.</li>
        <li>Open a pull request. CI fetches the pinned file, verifies the checksum, validates `.nut` v2, and derives search/preview metadata.</li>
        <li>After merge, the generated catalog exposes the new version.</li>
      </ol>
      <p>Eventually <code>deez nuts publish</code> can prepare these steps, but automated GitHub mutation is deliberately outside this milestone.</p>
      <p><a class="button" href="https://github.com/chrisbirster/deez-run/tree/main/registry/nuts">View registry</a></p>
    </section>
  );
}

export function NotFoundPage() {
  return (
    <section class="section narrow-top">
      <Seo
        title="Not found"
        description="This deez.run page was not found."
        path="/404"
        noindex
      />
      <p class="eyebrow">404</p>
      <h1>That nut is not in the sack.</h1>
      <p><a href="/nuts">Browse public nuts</a> or <a href="/search">search the registry</a>.</p>
    </section>
  );
}
