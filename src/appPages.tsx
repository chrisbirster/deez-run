import { For, Show, createSignal, type ParentProps } from "solid-js";
import { useNavigate, useParams, useSearchParams } from "@solidjs/router";
import * as stylex from "@stylexjs/stylex";
import { ApiError, appApi, type Capabilities, type CardDetail, type Deck, type Note, type NoteInput, type StudyPreview, type User } from "./appApi";
import { appStyles as s } from "./appStyles.stylex";
import { styles } from "./siteStyles";
import { Seo } from "./seo";

function message(reason: unknown) {
  return reason instanceof Error ? reason.message : "Something went wrong.";
}

function AppShell(props: ParentProps) {
  const [user, setUser] = createSignal<User>();
  const [authError, setAuthError] = createSignal<string>();
  void appApi.me().then((value) => {
    setUser(value);
    if (!value.username && window.location.pathname !== "/app/onboarding") window.location.assign("/app/onboarding");
  }).catch((reason) => {
    if (reason instanceof ApiError && reason.status === 401) {
      window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname)}`);
      return;
    }
    setAuthError(message(reason));
  });

  return (
    <div {...stylex.props(s.appShell)}>
      <aside {...stylex.props(s.side)}>
        <Show when={user()} fallback={<p {...stylex.props(s.muted)}>Connecting…</p>}>
          {(current) => <p><strong>@{current().username ?? "new-user"}</strong><br /><span {...stylex.props(s.muted)}>{current().email}</span></p>}
        </Show>
        <nav {...stylex.props(s.sideNav)} aria-label="My Deez">
          <a {...stylex.props(s.sideLink)} href="/app">Today</a>
          <a {...stylex.props(s.sideLink)} href="/app/decks">My nuts</a>
          <a {...stylex.props(s.sideLink)} href="/app/settings">Settings</a>
          <a {...stylex.props(s.sideLink)} href="/nuts">Public nuts</a>
        </nav>
      </aside>
      <div {...stylex.props(s.main)}>
        <Show when={authError()}>{(value) => <div {...stylex.props(s.error)}>{value()}</div>}</Show>
        {props.children}
      </div>
    </div>
  );
}

export function LoginPage() {
  const [params] = useSearchParams();
  const [email, setEmail] = createSignal("");
  const [sent, setSent] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<string>();

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    setBusy(true); setError(undefined);
    try {
      await appApi.requestMagicLink(email());
      setSent(true);
    } catch (reason) { setError(message(reason)); }
    finally { setBusy(false); }
  }

  return (
    <section {...stylex.props(s.authWrap)}>
      <Seo title="Sign in" description="Sign in to your synced Deez library with a magic link." path="/login" noindex />
      <div {...stylex.props(s.authCard)}>
        <p {...stylex.props(styles.eyebrow)}>Your Deez</p>
        <h1 {...stylex.props(styles.heading2)}>Sign in without a password</h1>
        <p {...stylex.props(s.muted)}>Enter your email. We’ll send a one-time link that signs this browser in.</p>
        <Show when={error()}>{(value) => <div {...stylex.props(s.error)}>{value()}</div>}</Show>
        <Show when={sent()} fallback={
          <form onSubmit={submit}>
            <label {...stylex.props(s.field)}><span {...stylex.props(s.label)}>Email</span><input {...stylex.props(s.input)} type="email" autocomplete="email" required value={email()} onInput={(e) => setEmail(e.currentTarget.value)} placeholder="you@example.com" /></label>
            <input type="hidden" name="next" value={String(params.next ?? "/app")} />
            <button {...stylex.props(styles.button)} disabled={busy()}>{busy() ? "Sending…" : "Email me a sign-in link"}</button>
          </form>
        }>
          <div {...stylex.props(s.success)}><strong>Check your email.</strong><br />If that address can receive mail, a Deez sign-in link is on its way.</div>
          <button {...stylex.props(styles.button, styles.buttonSecondary)} onClick={() => setSent(false)}>Use another email</button>
        </Show>
      </div>
    </section>
  );
}

export function MagicLinkPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<string>();
  const token = () => String(params.token ?? "");

  async function consume() {
    if (!token()) { setError("This sign-in link is missing its token."); return; }
    setBusy(true); setError(undefined);
    try {
      const result = await appApi.consumeMagicLink(token());
      history.replaceState(null, "", "/auth/magic");
      navigate(result.needs_username ? "/app/onboarding" : "/app", { replace: true });
    } catch (reason) { setError(message(reason)); }
    finally { setBusy(false); }
  }

  return (
    <section {...stylex.props(s.authWrap)}>
      <Seo title="Continue to Deez" description="Complete your Deez sign-in." path="/auth/magic" noindex />
      <div {...stylex.props(s.authCard)}>
        <p {...stylex.props(styles.eyebrow)}>Magic link</p>
        <h1 {...stylex.props(styles.heading2)}>Continue to Deez</h1>
        <p {...stylex.props(s.muted)}>Pressing Continue consumes this one-time link. Opening the email alone does not sign you in.</p>
        <Show when={error()}>{(value) => <div {...stylex.props(s.error)}>{value()}</div>}</Show>
        <button {...stylex.props(styles.button)} disabled={busy()} onClick={() => void consume()}>{busy() ? "Signing in…" : "Continue"}</button>
      </div>
    </section>
  );
}

export function OnboardingPage() {
  const navigate = useNavigate();
  const [username, setUsername] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<string>();

  async function save(event: SubmitEvent) {
    event.preventDefault(); setBusy(true); setError(undefined);
    try { await appApi.setUsername(username()); navigate("/app", { replace: true }); }
    catch (reason) { setError(message(reason)); }
    finally { setBusy(false); }
  }

  return <AppShell><section {...stylex.props(s.panel)}><p {...stylex.props(styles.eyebrow)}>One last thing</p><h1 {...stylex.props(s.appHeading)}>Choose your username</h1><p {...stylex.props(s.muted)}>This becomes your public Deez handle, for example <code>@chrisdontmiss</code>. Your email stays private.</p><Show when={error()}>{(value) => <div {...stylex.props(s.error)}>{value()}</div>}</Show><form onSubmit={save}><label {...stylex.props(s.field)}><span {...stylex.props(s.label)}>Username</span><input {...stylex.props(s.input)} required minlength="3" maxlength="32" autocomplete="username" value={username()} onInput={(e) => setUsername(e.currentTarget.value)} placeholder="chrisdontmiss" /></label><button {...stylex.props(styles.button)} disabled={busy()}>{busy() ? "Saving…" : "Create my Deez"}</button></form></section></AppShell>;
}

export function AppHomePage() {
  const [decks, setDecks] = createSignal<Deck[]>([]);
  const [error, setError] = createSignal<string>();
  void appApi.listDecks().then(setDecks).catch((reason) => setError(message(reason)));
  const due = () => decks().reduce((sum, deck) => sum + deck.due_count, 0);
  return <AppShell><Seo title="My Deez" description="Your synced Deez study queue." path="/app" noindex /><div {...stylex.props(s.topRow)}><div><p {...stylex.props(styles.eyebrow)}>Today</p><h1 {...stylex.props(s.appHeading)}>{due()} cards due</h1></div><a {...stylex.props(styles.button)} href="/app/decks">My nuts</a></div><Show when={error()}>{(value) => <div {...stylex.props(s.error)}>{value()}</div>}</Show><div {...stylex.props(s.grid)}><For each={decks().filter((deck) => deck.due_count > 0)} fallback={<div {...stylex.props(s.panel)}><strong>You’re caught up.</strong><p {...stylex.props(s.muted)}>No cards are due right now.</p></div>}>{(deck) => <a {...stylex.props(s.listItem)} href={`/app/decks/${deck.id}/study`}><strong>{deck.name}</strong><p {...stylex.props(s.muted)}>{deck.due_count} due · {deck.card_count} cards</p></a>}</For></div></AppShell>;
}

export function DecksPage() {
  const [decks, setDecks] = createSignal<Deck[]>([]);
  const [name, setName] = createSignal("");
  const [error, setError] = createSignal<string>();
  const [busy, setBusy] = createSignal(false);
  const load = () => void appApi.listDecks().then(setDecks).catch((reason) => setError(message(reason)));
  load();
  async function create(event: SubmitEvent) { event.preventDefault(); setBusy(true); setError(undefined); try { const deck = await appApi.createDeck(name()); setName(""); window.location.assign(`/app/decks/${deck.id}`); } catch (reason) { setError(message(reason)); } finally { setBusy(false); } }
  return <AppShell><div {...stylex.props(s.topRow)}><div><p {...stylex.props(styles.eyebrow)}>Library</p><h1 {...stylex.props(s.appHeading)}>My nuts</h1></div></div><Show when={error()}>{(value) => <div {...stylex.props(s.error)}>{value()}</div>}</Show><form {...stylex.props(s.panel)} onSubmit={create}><label {...stylex.props(s.field)}><span {...stylex.props(s.label)}>New deck</span><input {...stylex.props(s.input)} value={name()} onInput={(e) => setName(e.currentTarget.value)} required maxlength="200" placeholder="SSH concepts" /></label><button {...stylex.props(styles.button)} disabled={busy()}>{busy() ? "Creating…" : "Create deck"}</button></form><div {...stylex.props(s.list)}><For each={decks()} fallback={<div {...stylex.props(s.panel)}>Your library is empty. Create your first nut above.</div>}>{(deck) => <a {...stylex.props(s.listItem)} href={`/app/decks/${deck.id}`}><div {...stylex.props(s.row)}><strong>{deck.name}</strong><span {...stylex.props(s.muted)}>{deck.due_count} due</span></div><p {...stylex.props(s.muted)}>{deck.note_count} notes · {deck.card_count} cards</p></a>}</For></div></AppShell>;
}

export function DeckPage() {
  const params = useParams();
  const id = () => String(params.deckId ?? "");
  const [deck, setDeck] = createSignal<Deck>();
  const [notes, setNotes] = createSignal<Array<{ id: string; note_type: string; preview: string; card_count: number }>>([]);
  const [error, setError] = createSignal<string>();
  async function load() { try { const [d, n] = await Promise.all([appApi.getDeck(id()), appApi.listNotes(id())]); setDeck(d); setNotes(n); } catch (reason) { setError(message(reason)); } }
  void load();
  return <AppShell><Show when={error()}>{(value) => <div {...stylex.props(s.error)}>{value()}</div>}</Show><Show when={deck()}>{(current) => <><div {...stylex.props(s.topRow)}><div><a href="/app/decks">← My nuts</a><h1 {...stylex.props(s.appHeading)}>{current().name}</h1><p {...stylex.props(s.muted)}>{current().note_count} notes · {current().card_count} cards · {current().due_count} due</p></div><div {...stylex.props(s.actions)}><a {...stylex.props(styles.button, styles.buttonSecondary)} href={`/app/decks/${id()}/notes/new`}>Add note</a><a {...stylex.props(styles.button)} href={`/app/decks/${id()}/study`}>Study</a></div></div><div {...stylex.props(s.list)}><For each={notes()} fallback={<div {...stylex.props(s.panel)}>No notes yet.</div>}>{(note) => <a {...stylex.props(s.listItem)} href={`/app/decks/${id()}/notes/${note.id}`}><div {...stylex.props(s.row)}><strong>{note.preview || "Untitled note"}</strong><span {...stylex.props(s.muted)}>{note.note_type}</span></div><span {...stylex.props(s.muted)}>{note.card_count} card{note.card_count === 1 ? "" : "s"}</span></a>}</For></div></>}</Show></AppShell>;
}

export function NoteEditorPage() {
  const params = useParams();
  const navigate = useNavigate();
  const deckId = () => String(params.deckId ?? "");
  const noteId = () => params.noteId ? String(params.noteId) : undefined;
  const editing = () => Boolean(noteId());
  const [caps, setCaps] = createSignal<Capabilities>();
  const [note, setNote] = createSignal<Note>();
  const [type, setType] = createSignal("basic");
  const [fields, setFields] = createSignal<string[]>([]);
  const [tags, setTags] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<string>();
  const definition = () => caps()?.note_types.find((candidate) => candidate.slug === type());
  function resetFields(slug: string) { const def = caps()?.note_types.find((candidate) => candidate.slug === slug); if (def) setFields(def.fields.map(() => "")); }
  async function load() { try { const c = await appApi.capabilities(); setCaps(c); if (noteId()) { const n = await appApi.getNote(noteId()!); setNote(n); setType(n.note_type); setFields(n.fields); setTags(n.tags.join(", ")); } else { const first = c.note_types.find((candidate) => candidate.slug === "basic") ?? c.note_types[0]; if (first) { setType(first.slug); setFields(first.fields.map(() => "")); } } } catch (reason) { setError(message(reason)); } }
  void load();
  function input(): NoteInput { return { note_type: type(), fields: fields(), tags: tags().split(",").map((tag) => tag.trim()).filter(Boolean) }; }
  async function save() { setBusy(true); setError(undefined); try { if (noteId()) await appApi.updateNote(noteId()!, input()); else await appApi.createNote(deckId(), input()); navigate(`/app/decks/${deckId()}`); } catch (reason) { setError(message(reason)); } finally { setBusy(false); } }
  async function remove() { if (!noteId() || !window.confirm("Delete this note and its generated cards?")) return; setBusy(true); try { await appApi.deleteNote(noteId()!); navigate(`/app/decks/${deckId()}`); } catch (reason) { setError(message(reason)); setBusy(false); } }
  return <AppShell><div {...stylex.props(s.topRow)}><div><a href={`/app/decks/${deckId()}`}>← Deck</a><h1 {...stylex.props(s.appHeading)}>{editing() ? "Edit note" : "New note"}</h1></div><div {...stylex.props(s.actions)}><Show when={editing()}><button {...stylex.props(styles.button, styles.buttonSecondary, s.danger)} disabled={busy()} onClick={() => void remove()}>Delete</button></Show><button {...stylex.props(styles.button)} disabled={busy()} onClick={() => void save()}>{busy() ? "Saving…" : "Save"}</button></div></div><Show when={error()}>{(value) => <div {...stylex.props(s.error)}>{value()}</div>}</Show><section {...stylex.props(s.panel)}><label {...stylex.props(s.field)}><span {...stylex.props(s.label)}>Note type</span><select {...stylex.props(s.select)} disabled={editing()} value={type()} onChange={(e) => { setType(e.currentTarget.value); resetFields(e.currentTarget.value); }}><For each={caps()?.note_types ?? []}>{(item) => <option value={item.slug}>{item.name}</option>}</For></select></label><Show when={definition()}>{(def) => <For each={def().fields}>{(field, index) => <label {...stylex.props(s.field)}><span {...stylex.props(s.label)}>{field.name}</span><textarea {...stylex.props(s.textarea)} value={fields()[index()] ?? ""} onInput={(e) => { const next = [...fields()]; next[index()] = e.currentTarget.value; setFields(next); }} /></label>}</For>}</Show><label {...stylex.props(s.field)}><span {...stylex.props(s.label)}>Tags</span><input {...stylex.props(s.input)} value={tags()} onInput={(e) => setTags(e.currentTarget.value)} placeholder="ssh, linux, networking" /></label><Show when={note()}>{(current) => <p {...stylex.props(s.muted)}>Stable note ID: <code>{current().id}</code></p>}</Show></section></AppShell>;
}

export function StudyPage() {
  const params = useParams();
  const deckId = () => String(params.deckId ?? "");
  const [card, setCard] = createSignal<CardDetail>();
  const [preview, setPreview] = createSignal<StudyPreview>();
  const [revealed, setRevealed] = createSignal(false);
  const [done, setDone] = createSignal(false);
  const [error, setError] = createSignal<string>();
  const [busy, setBusy] = createSignal(false);
  async function next() { setRevealed(false); setCard(undefined); setPreview(undefined); setError(undefined); try { const due = await appApi.nextStudyCard(deckId()); if (!due.card) { setDone(true); return; } setDone(false); const [detail, schedule] = await Promise.all([appApi.getCard(due.card.id), appApi.previewStudy(due.card.id)]); setCard(detail); setPreview(schedule); } catch (reason) { setError(message(reason)); } }
  void next();
  async function rate(rating: 1 | 2 | 3 | 4) { const current = card(); const schedule = preview(); if (!current || !schedule) return; setBusy(true); try { await appApi.review(current.id, rating, schedule.review_count); await next(); } catch (reason) { setError(message(reason)); } finally { setBusy(false); } }
  const labels: Array<[1 | 2 | 3 | 4, "again" | "hard" | "good" | "easy", string]> = [[1, "again", "Again"], [2, "hard", "Hard"], [3, "good", "Good"], [4, "easy", "Easy"]];
  return <AppShell><div {...stylex.props(s.topRow)}><div><a href={`/app/decks/${deckId()}`}>← Deck</a><h1 {...stylex.props(s.appHeading)}>Study</h1></div></div><Show when={error()}>{(value) => <div {...stylex.props(s.error)}>{value()}</div>}</Show><Show when={done()} fallback={<Show when={card()}>{(current) => <><section {...stylex.props(s.studyCard)}><div {...stylex.props(s.studyFace)}>{revealed() ? current().rendered.back : current().rendered.front}</div><Show when={!revealed()}><button {...stylex.props(styles.button)} onClick={() => setRevealed(true)}>Show answer</button></Show></section><Show when={revealed() && preview()}>{(schedule) => <div {...stylex.props(s.ratingGrid)}><For each={labels}>{([rating, key, label]) => <button {...stylex.props(styles.button, styles.buttonSecondary)} disabled={busy()} onClick={() => void rate(rating)}><span>{label}</span>&nbsp;<small>{schedule().schedule[key].interval_days.toFixed(1)}d</small></button>}</For></div>}</Show></>}</Show>}><div {...stylex.props(s.panel)}><h2>All caught up.</h2><p {...stylex.props(s.muted)}>Your synced review state says there are no cards due in this deck.</p><a {...stylex.props(styles.button)} href={`/app/decks/${deckId()}`}>Back to deck</a></div></Show></AppShell>;
}

export function SettingsPage() {
  const [user, setUser] = createSignal<User>();
  const [error, setError] = createSignal<string>();
  void appApi.me().then(setUser).catch((reason) => setError(message(reason)));
  async function logout(all = false) { try { if (all) await appApi.logoutAll(); else await appApi.logout(); window.location.assign("/"); } catch (reason) { setError(message(reason)); } }
  return <AppShell><div {...stylex.props(s.topRow)}><div><p {...stylex.props(styles.eyebrow)}>Account</p><h1 {...stylex.props(s.appHeading)}>Settings</h1></div></div><Show when={error()}>{(value) => <div {...stylex.props(s.error)}>{value()}</div>}</Show><Show when={user()}>{(current) => <section {...stylex.props(s.panel)}><p><strong>Username</strong><br />@{current().username}</p><p><strong>Email</strong><br />{current().email}</p><p {...stylex.props(s.muted)}>This browser signs out after seven days without activity. An active session is still capped at thirty days before a new magic link is required.</p><div {...stylex.props(s.actions)}><button {...stylex.props(styles.button, styles.buttonSecondary)} onClick={() => void logout(false)}>Sign out</button><button {...stylex.props(styles.button, styles.buttonSecondary, s.danger)} onClick={() => void logout(true)}>Sign out everywhere</button></div></section>}</Show></AppShell>;
}
