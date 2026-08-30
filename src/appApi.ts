export type ApiId = string;

export type User = {
  id: string;
  email: string;
  username: string | null;
};

export type AuthConsume = {
  user: User;
  needs_username: boolean;
  is_new_user: boolean;
};

export type FieldDefinition = { ordinal: number; name: string };
export type NoteTypeDefinition = { id: ApiId; slug: string; name: string; fields: FieldDefinition[] };
export type Capabilities = { api_version: "v1"; note_types: NoteTypeDefinition[] };
export type Deck = { id: ApiId; name: string; note_count: number; card_count: number; due_count: number };
export type NoteSummary = { id: ApiId; deck_id: ApiId; note_type: string; preview: string; card_count: number; updated_at_ms: number };
export type Note = { id: ApiId; deck_id: ApiId; note_type: string; fields: string[]; tags: string[]; created_at_ms: number; updated_at_ms: number };
export type NoteInput = { note_type: string; fields: string[]; tags: string[] };
export type CardSummary = { id: ApiId; deck_id: ApiId; front: string; due_at_ms?: number; last_reviewed_at_ms?: number };
export type StudyNext = { card: { id: ApiId; deck_id: ApiId; due_at_ms: number | null } | null };
export type StudyPreview = {
  card_id: ApiId;
  review_count: number;
  retrievability: number | null;
  schedule: Record<"again" | "hard" | "good" | "easy", { rating: 1 | 2 | 3 | 4; due_at_ms: number; interval_days: number }>;
};
export type CardDetail = {
  id: ApiId;
  deck_id: ApiId;
  rendered: { front: string; back: string; css: string };
  review_count: number;
};

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message);
    this.name = "ApiError";
  }
}

type ErrorBody = { error?: { code?: string; message?: string } };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    credentials: "same-origin",
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    let body: ErrorBody | undefined;
    try { body = (await response.json()) as ErrorBody; } catch { /* non-JSON fallback */ }
    throw new ApiError(body?.error?.message ?? `${response.status} ${response.statusText}`, response.status, body?.error?.code);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const appApi = {
  requestMagicLink: (email: string) => request<{ status: "check_email" }>("/auth/magic-link", { method: "POST", body: JSON.stringify({ email }) }),
  consumeMagicLink: (token: string) => request<AuthConsume>("/auth/magic/consume", { method: "POST", body: JSON.stringify({ token }) }),
  me: () => request<User>("/auth/me"),
  setUsername: (username: string) => request<User>("/auth/username", { method: "POST", body: JSON.stringify({ username }) }),
  logout: () => request<void>("/auth/logout", { method: "POST" }),
  logoutAll: () => request<void>("/auth/logout-all", { method: "POST" }),
  capabilities: () => request<Capabilities>("/capabilities"),
  listDecks: () => request<Deck[]>("/decks"),
  createDeck: (name: string) => request<Deck>("/decks", { method: "POST", body: JSON.stringify({ name }) }),
  getDeck: (id: string) => request<Deck>(`/decks/${encodeURIComponent(id)}`),
  renameDeck: (id: string, name: string) => request<Deck>(`/decks/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ name }) }),
  deleteDeck: (id: string) => request<void>(`/decks/${encodeURIComponent(id)}`, { method: "DELETE" }),
  listNotes: (deckId: string) => request<NoteSummary[]>(`/decks/${encodeURIComponent(deckId)}/notes`),
  listCards: (deckId: string) => request<CardSummary[]>(`/decks/${encodeURIComponent(deckId)}/cards`),
  getNote: (noteId: string) => request<Note>(`/notes/${encodeURIComponent(noteId)}`),
  createNote: (deckId: string, input: NoteInput) => request<Note>(`/decks/${encodeURIComponent(deckId)}/notes`, { method: "POST", body: JSON.stringify(input) }),
  updateNote: (noteId: string, input: NoteInput) => request<Note>(`/notes/${encodeURIComponent(noteId)}`, { method: "PATCH", body: JSON.stringify(input) }),
  deleteNote: (noteId: string) => request<void>(`/notes/${encodeURIComponent(noteId)}`, { method: "DELETE" }),
  nextStudyCard: (deckId: string) => request<StudyNext>(`/decks/${encodeURIComponent(deckId)}/study/next`),
  getCard: (cardId: string) => request<CardDetail>(`/cards/${encodeURIComponent(cardId)}`),
  previewStudy: (cardId: string) => request<StudyPreview>(`/cards/${encodeURIComponent(cardId)}/study/preview`),
  review: (cardId: string, rating: 1 | 2 | 3 | 4, expectedReviewCount: number) => request<unknown>(`/cards/${encodeURIComponent(cardId)}/reviews`, { method: "POST", body: JSON.stringify({ rating, expected_review_count: expectedReviewCount }) }),
};
