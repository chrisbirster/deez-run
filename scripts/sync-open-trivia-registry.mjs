#!/usr/bin/env node

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DEEZ_NUTS_REPO = "chrisbirster/deez-nuts";
const DEEZ_NUTS_COMMIT = "17c68f4b375f2f8df22bdf091c97b7e2afd5a73e";
const CATALOG_URL = `https://raw.githubusercontent.com/${DEEZ_NUTS_REPO}/${DEEZ_NUTS_COMMIT}/sources/open-trivia-qa-catalog.json`;
const GENERATED_MANIFEST = "registry/open-trivia-qa-generated.json";
const REGISTRY_DIR = "registry/nuts";

const CATEGORY_TAGS = {
  animals: ["animals"],
  "brain-teasers": ["brain-teasers"],
  celebrities: ["celebrities", "pop-culture"],
  entertainment: ["entertainment", "pop-culture"],
  "for-kids": ["for-kids", "general-knowledge"],
  general: ["general-knowledge"],
  geography: ["geography"],
  history: ["history"],
  hobbies: ["hobbies"],
  humanities: ["humanities"],
  literature: ["literature"],
  movies: ["movies", "pop-culture"],
  music: ["music", "pop-culture"],
  people: ["people"],
  "religion-faith": ["religion", "faith"],
  "science-technology": ["science", "technology"],
  sports: ["sports"],
  television: ["television", "pop-culture"],
  "video-games": ["video-games", "gaming"],
  world: ["world", "general-knowledge"],
};

function titleFromCategory(category) {
  return category
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function registryEntry(deck) {
  const categoryName = titleFromCategory(deck.category);
  return {
    schema_version: 1,
    slug: deck.slug,
    name: deck.name,
    description: `Open-licensed ${categoryName} trivia, volume ${deck.volume}. Generated from the OpenTriviaQA archive and capped at 500 logical notes per Deez nut.`,
    authors: [
      { github: "uberspot", name: "OpenTriviaQA contributors" },
      { github: "chrisbirster", name: "Chris Birster" },
    ],
    tags: ["trivia", "open-trivia-qa", ...(CATEGORY_TAGS[deck.category] ?? [deck.category])],
    license: "CC-BY-SA-4.0",
    source: {
      type: "github",
      repository: DEEZ_NUTS_REPO,
    },
    versions: [
      {
        version: "1.0.0",
        commit: DEEZ_NUTS_COMMIT,
        path: deck.path,
        sha256: deck.sha256,
      },
    ],
  };
}

async function readOldSlugs() {
  try {
    const raw = await readFile(GENERATED_MANIFEST, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.slugs) ? parsed.slugs : [];
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

async function main() {
  const response = await fetch(CATALOG_URL, {
    headers: { "user-agent": "deez-run-open-trivia-registry/1.0" },
  });
  if (!response.ok) {
    throw new Error(`failed to fetch ${CATALOG_URL}: ${response.status} ${response.statusText}`);
  }

  const catalog = await response.json();
  if (!Array.isArray(catalog.decks) || catalog.decks.length === 0) {
    throw new Error("OpenTriviaQA catalog contains no decks");
  }

  await mkdir(REGISTRY_DIR, { recursive: true });

  const oldSlugs = await readOldSlugs();
  for (const slug of oldSlugs) {
    await rm(join(REGISTRY_DIR, `${slug}.json`), { force: true });
  }

  const slugs = [];
  for (const deck of catalog.decks) {
    if (!deck.slug || !deck.path || !deck.sha256 || !deck.category || !deck.volume) {
      throw new Error(`invalid catalog entry: ${JSON.stringify(deck)}`);
    }
    const entry = registryEntry(deck);
    await writeFile(
      join(REGISTRY_DIR, `${deck.slug}.json`),
      `${JSON.stringify(entry, null, 2)}\n`,
      "utf8",
    );
    slugs.push(deck.slug);
  }

  await mkdir(dirname(GENERATED_MANIFEST), { recursive: true });
  await writeFile(
    GENERATED_MANIFEST,
    `${JSON.stringify(
      {
        source_repository: DEEZ_NUTS_REPO,
        source_commit: DEEZ_NUTS_COMMIT,
        catalog_url: CATALOG_URL,
        deck_count: slugs.length,
        slugs,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  console.log(`generated ${slugs.length} OpenTriviaQA registry entries`);
}

await main();
