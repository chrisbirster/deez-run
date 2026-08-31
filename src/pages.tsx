import { For, Show } from "solid-js";
import { useParams, useSearchParams } from "@solidjs/router";
import * as stylex from "@stylexjs/stylex";
import {
  catalog,
  findNut,
  formatBytes,
  nutsByAuthor,
  searchNuts,
  type CatalogEntry,
} from "./lib/catalog";
import { Seo } from "./seo";
import { styles } from "./siteStyles";

function NutCard(props: { nut: CatalogEntry }) {
  return (
    <article {...stylex.attrs(styles.surface, styles.card)}>
      <div {...stylex.attrs(styles.eyebrow)}>
        {props.nut.latest.note_count} notes · {props.nut.latest.card_count} cards
      </div>
      <h2 {...stylex.attrs(styles.heading2, styles.cardTitle)}>
        <a href={`/nuts/${props.nut.slug}`}>{props.nut.name}</a>
      </h2>
      <p {...stylex.attrs(styles.bodyCopy)}>{props.nut.description}</p>
      <div {...stylex.attrs(styles.tagRow)}>
        <For each={props.nut.tags}>{(tag) => <span {...stylex.attrs(styles.tag)}>{tag}</span>}</For>
      </div>
      <p {...stylex.attrs(styles.muted)}>
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
    <div {...stylex.attrs(styles.surface, styles.empty)}>
      <h2 {...stylex.attrs(styles.heading2)}>The registry is ready for its first nut.</h2>
      <p {...stylex.attrs(styles.bodyCopy)}>
        Deck content stays in the author's GitHub repository. deez.run only indexes
        validated, checksum-pinned metadata.
      </p>
      <a {...stylex.attrs(styles.button)} href="/publish">Read the publishing workflow</a>
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
      <section {...stylex.attrs(styles.hero)}>
        <div>
          <p {...stylex.attrs(styles.eyebrow)}>Public Deez catalog</p>
          <h1 {...stylex.attrs(styles.heading1)}>Find a nut. Learn it with Deez.</h1>
          <p {...stylex.attrs(styles.lede)}>
            deez.run is the user-facing Deez app and public deck catalog. The hosted app
            talks to the same Zig core that powers the CLI.
          </p>
          <form {...stylex.attrs(styles.searchBox)} action="/search" method="get">
            <label {...stylex.attrs(styles.srOnly)} for="home-search">Search public nuts</label>
            <input {...stylex.attrs(styles.searchInput)} id="home-search" name="q" type="search" placeholder="Search data structures, Zig, MongoDB…" />
            <button {...stylex.attrs(styles.button)} type="submit">Search</button>
          </form>
        </div>
        <aside {...stylex.attrs(styles.surface, styles.flowCard)} aria-label="How deez.run works">
          <code {...stylex.attrs(styles.flowCode)}>deez.run</code>
          <span {...stylex.attrs(styles.flowStep)}>↓ Solid 2 SPA</span>
          <code {...stylex.attrs(styles.flowCode)}>deez serve</code>
          <span {...stylex.attrs(styles.flowStep)}>↓ FSRS + storage in Zig</span>
          <code {...stylex.attrs(styles.flowCode)}>MongoDB / SQLite</code>
        </aside>
      </section>

      <section {...stylex.attrs(styles.section)}>
        <div {...stylex.attrs(styles.sectionHeading)}>
          <div>
            <p {...stylex.attrs(styles.eyebrow)}>Registry</p>
            <h2 {...stylex.attrs(styles.heading2)}>Public nuts</h2>
          </div>
          <a href="/nuts">Browse all</a>
        </div>
        <Show when={catalog.length > 0} fallback={<EmptyCatalog />}>
          <div {...stylex.attrs(styles.cardGrid)}>
            <For each={catalog.slice(0, 6)}>{(nut) => <NutCard nut={nut} />}</For>
          </div>
        </Show>
      </section>
    </>
  );
}

export function NutsPage() {
  return (
    <section {...stylex.attrs(styles.section, styles.narrowTop)}>
      <Seo
        title="Public nuts"
        description="Browse validated public Deez .nut decks with immutable GitHub source pins and SHA-256 checksums."
        path="/nuts"
      />
      <p {...stylex.attrs(styles.eyebrow)}>Browse</p>
      <h1 {...stylex.attrs(styles.heading1, styles.heading1Narrow)}>Public nuts</h1>
      <p {...stylex.attrs(styles.lede)}>Validated metadata and immutable GitHub source pins. No account required.</p>
      <Show when={catalog.length > 0} fallback={<EmptyCatalog />}>
        <div {...stylex.attrs(styles.cardGrid)}>
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
    <section {...stylex.attrs(styles.section, styles.narrowTop)}>
      <Seo
        title={query() ? `Search: ${query()}` : "Search"}
        description="Search public Deez nuts by name, description, tag, author, or note type."
        path={query() ? `/search?q=${encodeURIComponent(query())}` : "/search"}
        noindex
      />
      <p {...stylex.attrs(styles.eyebrow)}>Search</p>
      <h1 {...stylex.attrs(styles.heading1, styles.heading1Narrow)}>Search the registry</h1>
      <form {...stylex.attrs(styles.searchBox)} action="/search" method="get">
        <label {...stylex.attrs(styles.srOnly)} for="search-query">Search public nuts</label>
        <input {...stylex.attrs(styles.searchInput)} id="search-query" name="q" type="search" value={query()} placeholder="Search by name, tag, author, or note type" />
        <button {...stylex.attrs(styles.button)} type="submit">Search</button>
      </form>
      <p {...stylex.attrs(styles.muted)}>{results().length} result{results().length === 1 ? "" : "s"}{query() ? ` for “${query()}”` : ""}</p>
      <Show when={results().length > 0} fallback={<EmptyCatalog />}>
        <div {...stylex.attrs(styles.cardGrid)}>
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
          <article {...stylex.attrs(styles.section, styles.narrowTop)}>
            <Seo title={item.name} description={item.description} path={`/nuts/${item.slug}`} />
            <p {...stylex.attrs(styles.eyebrow)}>Nut · v{latest.version}</p>
            <h1 {...stylex.attrs(styles.heading1, styles.heading1Narrow)}>{item.name}</h1>
            <p {...stylex.attrs(styles.lede)}>{item.description}</p>
            <div {...stylex.attrs(styles.tagRow)}>
              <For each={item.tags}>{(tag) => <span {...stylex.attrs(styles.tag)}>{tag}</span>}</For>
            </div>

            <div {...stylex.attrs(styles.detailGrid)}>
              <section {...stylex.attrs(styles.surface, styles.panel)}>
                <h2 {...stylex.attrs(styles.heading2)}>Deck details</h2>
                <dl {...stylex.attrs(styles.facts)}>
                  <div {...stylex.attrs(styles.factRow)}><dt {...stylex.attrs(styles.factTerm)}>Author</dt><dd {...stylex.attrs(styles.factValue)}><For each={item.authors}>{(author) => <a href={`/authors/${author.github}`}>{author.name ?? author.github}</a>}</For></dd></div>
                  <div {...stylex.attrs(styles.factRow)}><dt {...stylex.attrs(styles.factTerm)}>Notes</dt><dd {...stylex.attrs(styles.factValue)}>{latest.note_count}</dd></div>
                  <div {...stylex.attrs(styles.factRow)}><dt {...stylex.attrs(styles.factTerm)}>Cards</dt><dd {...stylex.attrs(styles.factValue)}>{latest.card_count}</dd></div>
                  <div {...stylex.attrs(styles.factRow)}><dt {...stylex.attrs(styles.factTerm)}>Format</dt><dd {...stylex.attrs(styles.factValue)}>{latest.nut_format} v{latest.nut_version}</dd></div>
                  <div {...stylex.attrs(styles.factRow)}><dt {...stylex.attrs(styles.factTerm)}>Size</dt><dd {...stylex.attrs(styles.factValue)}>{formatBytes(latest.size_bytes)}</dd></div>
                  <div {...stylex.attrs(styles.factRow)}><dt {...stylex.attrs(styles.factTerm)}>License</dt><dd {...stylex.attrs(styles.factValue)}>{item.license ?? "Not declared"}</dd></div>
                  <div {...stylex.attrs(styles.factRow)}><dt {...stylex.attrs(styles.factTerm)}>Note types</dt><dd {...stylex.attrs(styles.factValue)}>{latest.note_types.join(", ") || "None"}</dd></div>
                </dl>
              </section>

              <section {...stylex.attrs(styles.surface, styles.panel)}>
                <h2 {...stylex.attrs(styles.heading2)}>Immutable source</h2>
                <p><a href={`https://github.com/${item.source.repository}`}>{item.source.repository}</a></p>
                <p {...stylex.attrs(styles.monoWrap)}><strong>Commit</strong><br />{latest.commit}</p>
                <p {...stylex.attrs(styles.monoWrap)}><strong>Path</strong><br />{latest.path}</p>
                <p {...stylex.attrs(styles.monoWrap)}><strong>SHA-256</strong><br />{latest.sha256}</p>
                <div {...stylex.attrs(styles.buttonRow)}>
                  <a {...stylex.attrs(styles.button)} href={latest.raw_url}>Download .nut</a>
                  <a {...stylex.attrs(styles.button, styles.buttonSecondary)} href={latest.source_url}>View source</a>
                </div>
              </section>
            </div>

            <section {...stylex.attrs(styles.surface, styles.panel)}>
              <div {...stylex.attrs(styles.sectionHeading)}>
                <div><p {...stylex.attrs(styles.eyebrow)}>Safe preview</p><h2 {...stylex.attrs(styles.heading2)}>Sample notes</h2></div>
                <span {...stylex.attrs(styles.muted)}>Rendered as text, never user HTML</span>
              </div>
              <Show when={latest.preview.length > 0} fallback={<p>No notes in this deck.</p>}>
                <div {...stylex.attrs(styles.previewList)}>
                  <For each={latest.preview}>
                    {(note) => (
                      <article {...stylex.attrs(styles.previewNote)}>
                        <div {...stylex.attrs(styles.eyebrow)}>{note.note_type}</div>
                        <For each={note.fields}>{(field, index) => <p {...stylex.attrs(styles.bodyCopy)}><strong>Field {index() + 1}:</strong> {field}</p>}</For>
                        <Show when={note.tags.length > 0}><p {...stylex.attrs(styles.muted)}>Tags: {note.tags.join(", ")}</p></Show>
                      </article>
                    )}
                  </For>
                </div>
              </Show>
            </section>

            <section {...stylex.attrs(styles.surface, styles.panel)}>
              <p {...stylex.attrs(styles.eyebrow)}>Install locally</p>
              <h2 {...stylex.attrs(styles.heading2)}>Download, verify, import</h2>
              <p {...stylex.attrs(styles.bodyCopy)}>This uses the exact commit registered above. deez.run is not in the import path.</p>
              <pre {...stylex.attrs(styles.pre)}><code>{install}</code></pre>
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
    <section {...stylex.attrs(styles.section, styles.narrowTop)}>
      <Seo title={`@${author()}`} description={`Public Deez nuts published by GitHub author @${author()}.`} path={`/authors/${author()}`} />
      <p {...stylex.attrs(styles.eyebrow)}>Author</p>
      <h1 {...stylex.attrs(styles.heading1, styles.heading1Narrow)}>@{author()}</h1>
      <p><a href={`https://github.com/${author()}`}>View GitHub profile</a></p>
      <Show when={entries().length > 0} fallback={<p>No registered nuts for this author.</p>}>
        <div {...stylex.attrs(styles.cardGrid)}><For each={entries()}>{(nut) => <NutCard nut={nut} />}</For></div>
      </Show>
    </section>
  );
}

export function DocsPage() {
  return (
    <section {...stylex.attrs(styles.section, styles.narrowTop, styles.prose)}>
      <Seo title="Docs" description="Learn how deez.run, .nut decks, .sack packages, checksums, and the Deez Zig core fit together." path="/docs" />
      <p {...stylex.attrs(styles.eyebrow)}>Docs</p>
      <h1 {...stylex.attrs(styles.heading1, styles.heading1Narrow)}>How deez.run fits Deez</h1>
      <p {...stylex.attrs(styles.proseCopy)}>deez.run is the web face of Deez. In production, the same Zig binary serves this SPA and the JSON API.</p>
      <h2 {...stylex.attrs(styles.heading2)}> .nut</h2>
      <p {...stylex.attrs(styles.proseCopy)}>A `.nut` v2 file is newline-delimited JSON: one deck header followed by logical note records. It contains shareable deck content, not review history or scheduler state.</p>
      <h2 {...stylex.attrs(styles.heading2)}>.sack</h2>
      <p {...stylex.attrs(styles.proseCopy)}>A `.sack` is the ZIP-compatible rich-media transport for a `.nut` plus content-addressed media.</p>
      <h2 {...stylex.attrs(styles.heading2)}>Runtime</h2>
      <p {...stylex.attrs(styles.proseCopy)}>Vite builds the Solid 2 SPA. At runtime, only the Deez Zig binary runs: it serves static files, API routes, FSRS scheduling, and MongoDB/SQLite storage.</p>
      <h2 {...stylex.attrs(styles.heading2)}>Local import</h2>
      <pre {...stylex.attrs(styles.pre)}><code>deez nut import deck.nut</code></pre>
    </section>
  );
}

export function PublishPage() {
  return (
    <section {...stylex.attrs(styles.section, styles.narrowTop, styles.prose)}>
      <Seo title="Publish" description="Publish a public Deez .nut through the GitHub-backed deez.run registry using immutable commit pins and SHA-256 verification." path="/publish" />
      <p {...stylex.attrs(styles.eyebrow)}>Publish</p>
      <h1 {...stylex.attrs(styles.heading1, styles.heading1Narrow)}>Publish a public nut</h1>
      <p {...stylex.attrs(styles.proseCopy)}>The initial workflow is intentionally GitHub- and PR-based.</p>
      <ol>
        <li {...stylex.attrs(styles.proseCopy)}>Put the `.nut` in a public GitHub repository and commit it.</li>
        <li {...stylex.attrs(styles.proseCopy)}>Use the full 40-character commit SHA, not a mutable branch name.</li>
        <li {...stylex.attrs(styles.proseCopy)}>Calculate SHA-256 over the exact `.nut` bytes at that commit.</li>
        <li {...stylex.attrs(styles.proseCopy)}>Add or update one registry entry under <code>registry/nuts/</code>.</li>
        <li {...stylex.attrs(styles.proseCopy)}>Open a pull request. CI verifies the checksum and `.nut` v2 metadata.</li>
      </ol>
      <p><a {...stylex.attrs(styles.button)} href="https://github.com/chrisbirster/deez-run/tree/main/registry/nuts">View registry</a></p>
    </section>
  );
}

export function NotFoundPage() {
  return (
    <section {...stylex.attrs(styles.section, styles.narrowTop)}>
      <Seo title="Not found" description="This deez.run page was not found." path="/404" noindex />
      <p {...stylex.attrs(styles.eyebrow)}>404</p>
      <h1 {...stylex.attrs(styles.heading1, styles.heading1Narrow)}>That nut is not in the sack.</h1>
      <p><a href="/nuts">Browse public nuts</a> or <a href="/search">search the registry</a>.</p>
    </section>
  );
}
