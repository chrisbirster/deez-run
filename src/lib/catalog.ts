import generated from "../generated/catalog.json";

export interface CatalogAuthor {
  github: string;
  name?: string;
}

export interface PreviewNote {
  note_type: string;
  fields: string[];
  tags: string[];
}

export interface CatalogVersion {
  version: string;
  commit: string;
  path: string;
  sha256: string;
  raw_url: string;
  source_url: string;
  size_bytes: number;
  deck_name: string;
  nut_format: "deez.nut";
  nut_version: 2;
  note_count: number;
  card_count: number;
  note_types: string[];
  preview: PreviewNote[];
}

export interface CatalogEntry {
  schema_version: 1;
  slug: string;
  name: string;
  description: string;
  authors: CatalogAuthor[];
  tags: string[];
  license: string | null;
  source: {
    type: "github";
    repository: string;
  };
  latest: CatalogVersion;
  versions: CatalogVersion[];
}

export const catalog = (generated.entries ?? []) as CatalogEntry[];

export function findNut(slug: string): CatalogEntry | undefined {
  return catalog.find((entry) => entry.slug === slug);
}

export function nutsByAuthor(author: string): CatalogEntry[] {
  const needle = author.toLowerCase();
  return catalog.filter((entry) =>
    entry.authors.some((candidate) => candidate.github.toLowerCase() === needle),
  );
}

export function searchNuts(query: string): CatalogEntry[] {
  const terms = query
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (terms.length === 0) return catalog;

  return catalog.filter((entry) => {
    const haystack = [
      entry.slug,
      entry.name,
      entry.description,
      ...entry.tags,
      ...entry.authors.flatMap((author) => [author.github, author.name ?? ""]),
      ...entry.latest.note_types,
    ]
      .join(" ")
      .toLowerCase();

    return terms.every((term) => haystack.includes(term));
  });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}
