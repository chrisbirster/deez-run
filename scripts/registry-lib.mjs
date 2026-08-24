import { createHash } from "node:crypto";

export const LIMITS = Object.freeze({
  fileBytes: 10 * 1024 * 1024,
  lineBytes: 256 * 1024,
  notes: 50_000,
  previewNotes: 5,
});

const NOTE_TYPES = new Map([
  ["basic", { canonical: "basic", fields: 2 }],
  ["reverse", { canonical: "basic-reverse", fields: 2 }],
  ["basic-reverse", { canonical: "basic-reverse", fields: 2 }],
  ["optional-reverse", { canonical: "optional-reverse", fields: 3 }],
  ["cloze", { canonical: "cloze", fields: 2 }],
  ["type-answer", { canonical: "type-answer", fields: 2 }],
  ["type", { canonical: "type-answer", fields: 2 }],
  ["multiple-choice", { canonical: "multiple-choice", fields: 4 }],
  ["mcq", { canonical: "multiple-choice", fields: 4 }],
  ["multiple-select", { canonical: "multiple-select", fields: 4 }],
  ["multi-select", { canonical: "multiple-select", fields: 4 }],
  ["ordering", { canonical: "ordering", fields: 3 }],
  ["order", { canonical: "ordering", fields: 3 }],
  ["image-occlusion", { canonical: "image-occlusion", fields: 3 }],
  ["occlusion", { canonical: "image-occlusion", fields: 3 }],
]);

function fail(message) {
  throw new Error(message);
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertObject(value, context) {
  if (!isObject(value)) fail(`${context} must be an object`);
}

function assertExactKeys(value, allowed, required, context) {
  assertObject(value, context);
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) fail(`${context} has unknown field ${key}`);
  }
  for (const key of required) {
    if (!(key in value)) fail(`${context} is missing ${key}`);
  }
}

function requireText(value, context) {
  if (typeof value !== "string" || value.trim().length === 0) fail(`${context} must be non-empty text`);
}

function parseJsonText(value, context) {
  if (typeof value !== "string") fail(`${context} must be a JSON string`);
  try {
    return JSON.parse(value);
  } catch {
    fail(`${context} contains invalid JSON`);
  }
}

function validateChoiceList(text, context) {
  const choices = parseJsonText(text, context);
  if (!Array.isArray(choices) || choices.length < 2) fail(`${context} must contain at least two choices`);
  const ids = new Set();
  for (const [index, choice] of choices.entries()) {
    assertExactKeys(choice, ["id", "text"], ["id", "text"], `${context}[${index}]`);
    requireText(choice.id, `${context}[${index}].id`);
    requireText(choice.text, `${context}[${index}].text`);
    if (ids.has(choice.id)) fail(`${context} contains duplicate id ${choice.id}`);
    ids.add(choice.id);
  }
  return { choices, ids };
}

function validateInteraction(type, fields, context) {
  if (type === "multiple-choice") {
    requireText(fields[0], `${context}.Prompt`);
    const { ids } = validateChoiceList(fields[1], `${context}.Choices`);
    requireText(fields[2], `${context}.Correct`);
    if (!ids.has(fields[2].trim())) fail(`${context}.Correct references an unknown choice id`);
    return 1;
  }

  if (type === "multiple-select") {
    requireText(fields[0], `${context}.Prompt`);
    const { ids } = validateChoiceList(fields[1], `${context}.Choices`);
    const correct = parseJsonText(fields[2], `${context}.Correct`);
    if (!Array.isArray(correct) || correct.length === 0) fail(`${context}.Correct must be a non-empty array`);
    const seen = new Set();
    for (const id of correct) {
      requireText(id, `${context}.Correct id`);
      if (!ids.has(id)) fail(`${context}.Correct references unknown id ${id}`);
      if (seen.has(id)) fail(`${context}.Correct contains duplicate id ${id}`);
      seen.add(id);
    }
    return 1;
  }

  if (type === "ordering") {
    requireText(fields[0], `${context}.Prompt`);
    validateChoiceList(fields[1], `${context}.Items`);
    return 1;
  }

  if (type === "image-occlusion") {
    if (!/^deez-media:\/\/sha256:[0-9a-f]{64}$/.test(fields[0])) fail(`${context}.Image must be a deez-media SHA-256 reference`);
    const masks = parseJsonText(fields[1], `${context}.Masks`);
    if (!Array.isArray(masks) || masks.length === 0) fail(`${context}.Masks must be non-empty`);
    const ids = new Set();
    for (const [index, mask] of masks.entries()) {
      assertExactKeys(mask, ["id", "x", "y", "width", "height", "answer", "prompt"], ["id", "x", "y", "width", "height", "answer"], `${context}.Masks[${index}]`);
      if (!Number.isInteger(mask.id) || mask.id <= 0) fail(`${context}.Masks[${index}].id must be a positive integer`);
      if (ids.has(mask.id)) fail(`${context}.Masks contains duplicate id ${mask.id}`);
      ids.add(mask.id);
      requireText(mask.answer, `${context}.Masks[${index}].answer`);
      if (mask.prompt !== undefined) requireText(mask.prompt, `${context}.Masks[${index}].prompt`);
      for (const key of ["x", "y", "width", "height"]) {
        if (typeof mask[key] !== "number" || !Number.isFinite(mask[key])) fail(`${context}.Masks[${index}].${key} must be finite`);
      }
      if (mask.x < 0 || mask.y < 0 || mask.width <= 0 || mask.height <= 0 || mask.x > 1 || mask.y > 1 || mask.width > 1 || mask.height > 1 || mask.x + mask.width > 1.0000001 || mask.y + mask.height > 1.0000001) {
        fail(`${context}.Masks[${index}] has an invalid normalized rectangle`);
      }
    }
    return masks.length;
  }

  return null;
}

function validateNote(record, context) {
  assertExactKeys(record, ["kind", "note_type", "fields", "tags_json"], ["kind", "note_type", "fields"], context);
  if (record.kind !== "note") fail(`${context}.kind must be note`);
  if (typeof record.note_type !== "string" || !NOTE_TYPES.has(record.note_type)) fail(`${context}.note_type is unsupported`);
  if (!Array.isArray(record.fields) || !record.fields.every((field) => typeof field === "string")) fail(`${context}.fields must be an array of strings`);

  const definition = NOTE_TYPES.get(record.note_type);
  if (record.fields.length !== definition.fields) fail(`${context}.fields expected ${definition.fields}, got ${record.fields.length}`);

  const fields = record.fields;
  const type = definition.canonical;
  if (["basic", "basic-reverse", "type-answer"].includes(type)) {
    requireText(fields[0], `${context}.fields[0]`);
    requireText(fields[1], `${context}.fields[1]`);
  } else if (type === "optional-reverse") {
    requireText(fields[0], `${context}.fields[0]`);
    requireText(fields[1], `${context}.fields[1]`);
  } else if (type === "cloze") {
    requireText(fields[0], `${context}.fields[0]`);
  } else {
    validateInteraction(type, fields, context);
  }

  const tags = parseJsonText(record.tags_json ?? "[]", `${context}.tags_json`);
  if (!Array.isArray(tags) || !tags.every((tag) => typeof tag === "string")) fail(`${context}.tags_json must encode an array of strings`);

  let cardCount = 1;
  if (type === "basic-reverse") cardCount = 2;
  if (type === "optional-reverse") cardCount = fields[2].trim().length > 0 ? 2 : 1;
  if (type === "cloze") {
    const ordinals = new Set();
    const expression = /\{\{c([1-9][0-9]*)::[\s\S]*?\}\}/g;
    for (const match of fields[0].matchAll(expression)) ordinals.add(Number(match[1]));
    if (ordinals.size === 0) fail(`${context} requires at least one valid cloze`);
    cardCount = ordinals.size;
  }
  if (["multiple-choice", "multiple-select", "ordering", "image-occlusion"].includes(type)) {
    cardCount = validateInteraction(type, fields, context);
  }

  return {
    canonicalType: type,
    cardCount,
    preview: {
      note_type: type,
      fields: fields.map((field) => field.slice(0, 2000)),
      tags: tags.slice(0, 20),
    },
  };
}

export function parseNut(text) {
  if (Buffer.byteLength(text, "utf8") > LIMITS.fileBytes) fail(`.nut exceeds public registry limit of ${LIMITS.fileBytes} bytes`);
  const nonEmpty = text.split("\n").map((line) => line.trim()).filter(Boolean);
  if (nonEmpty.length === 0) fail(".nut is empty");

  for (const [index, line] of nonEmpty.entries()) {
    if (Buffer.byteLength(line, "utf8") > LIMITS.lineBytes) fail(`line ${index + 1} exceeds public registry line limit`);
  }

  let header;
  try {
    header = JSON.parse(nonEmpty[0]);
  } catch {
    fail("deck header is invalid JSON");
  }
  assertExactKeys(header, ["kind", "format", "version", "name"], ["kind", "format", "version", "name"], "deck header");
  if (header.kind !== "deck") fail("first record must be a deck header");
  if (header.format !== "deez.nut") fail("unsupported .nut format");
  if (header.version !== 2) fail("public registry submissions must use deez.nut v2");
  requireText(header.name, "deck name");

  const notes = [];
  let cardCount = 0;
  const noteTypes = new Set();

  for (let index = 1; index < nonEmpty.length; index += 1) {
    if (notes.length >= LIMITS.notes) fail(`.nut exceeds public registry note limit of ${LIMITS.notes}`);
    let record;
    try {
      record = JSON.parse(nonEmpty[index]);
    } catch {
      fail(`record ${index + 1} is invalid JSON`);
    }
    const result = validateNote(record, `record ${index + 1}`);
    notes.push(result.preview);
    cardCount += result.cardCount;
    noteTypes.add(result.canonicalType);
  }

  return {
    deck_name: header.name,
    nut_format: "deez.nut",
    nut_version: 2,
    note_count: notes.length,
    card_count: cardCount,
    note_types: [...noteTypes].sort(),
    preview: notes.slice(0, LIMITS.previewNotes),
  };
}

export function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

export function parseSemver(version) {
  const match = SEMVER.exec(version);
  if (!match) fail(`invalid semantic version ${version}`);
  return { raw: version, major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]), prerelease: match[4]?.split(".") ?? [] };
}

function comparePrerelease(a, b) {
  if (a.length === 0 && b.length === 0) return 0;
  if (a.length === 0) return 1;
  if (b.length === 0) return -1;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    if (a[index] === undefined) return -1;
    if (b[index] === undefined) return 1;
    if (a[index] === b[index]) continue;
    const aNumeric = /^\d+$/.test(a[index]);
    const bNumeric = /^\d+$/.test(b[index]);
    if (aNumeric && bNumeric) return Number(a[index]) - Number(b[index]);
    if (aNumeric) return -1;
    if (bNumeric) return 1;
    return a[index].localeCompare(b[index]);
  }
  return 0;
}

export function compareSemver(a, b) {
  const left = parseSemver(a);
  const right = parseSemver(b);
  for (const key of ["major", "minor", "patch"]) {
    if (left[key] !== right[key]) return left[key] - right[key];
  }
  return comparePrerelease(left.prerelease, right.prerelease);
}

export function validateRegistryEntry(entry, fileName = "registry entry") {
  assertExactKeys(entry, ["schema_version", "slug", "name", "description", "authors", "tags", "license", "source", "versions"], ["schema_version", "slug", "name", "description", "authors", "tags", "source", "versions"], fileName);
  if (entry.schema_version !== 1) fail(`${fileName}.schema_version must be 1`);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.slug) || entry.slug.length > 80) fail(`${fileName}.slug is invalid`);
  requireText(entry.name, `${fileName}.name`);
  requireText(entry.description, `${fileName}.description`);
  if (entry.name.length > 120 || entry.description.length > 500) fail(`${fileName} text metadata is too long`);

  if (!Array.isArray(entry.authors) || entry.authors.length === 0) fail(`${fileName}.authors must be non-empty`);
  for (const [index, author] of entry.authors.entries()) {
    assertExactKeys(author, ["github", "name"], ["github"], `${fileName}.authors[${index}]`);
    if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(author.github)) fail(`${fileName}.authors[${index}].github is invalid`);
    if (author.name !== undefined) requireText(author.name, `${fileName}.authors[${index}].name`);
  }

  if (!Array.isArray(entry.tags) || entry.tags.length > 20) fail(`${fileName}.tags is invalid`);
  const tagSet = new Set();
  for (const tag of entry.tags) {
    if (typeof tag !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(tag)) fail(`${fileName}.tags contains invalid tag`);
    if (tagSet.has(tag)) fail(`${fileName}.tags contains duplicate ${tag}`);
    tagSet.add(tag);
  }
  if (entry.license !== undefined) requireText(entry.license, `${fileName}.license`);

  assertExactKeys(entry.source, ["type", "repository"], ["type", "repository"], `${fileName}.source`);
  if (entry.source.type !== "github") fail(`${fileName}.source.type must be github`);
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(entry.source.repository)) fail(`${fileName}.source.repository is invalid`);

  if (!Array.isArray(entry.versions) || entry.versions.length === 0) fail(`${fileName}.versions must be non-empty`);
  const versions = new Set();
  for (const [index, version] of entry.versions.entries()) {
    const context = `${fileName}.versions[${index}]`;
    assertExactKeys(version, ["version", "commit", "path", "sha256"], ["version", "commit", "path", "sha256"], context);
    parseSemver(version.version);
    if (versions.has(version.version)) fail(`${fileName} repeats version ${version.version}`);
    versions.add(version.version);
    if (!/^[0-9a-f]{40}$/.test(version.commit)) fail(`${context}.commit must be a full lowercase Git commit SHA`);
    if (!/^[0-9a-f]{64}$/.test(version.sha256)) fail(`${context}.sha256 must be lowercase SHA-256`);
    if (typeof version.path !== "string" || !version.path.endsWith(".nut") || version.path.startsWith("/") || version.path.includes("\\") || version.path.split("/").some((part) => part === "" || part === "." || part === "..")) fail(`${context}.path is unsafe or is not a .nut file`);
  }
  return entry;
}

export function rawGitHubUrl(repository, commit, path) {
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  return `https://raw.githubusercontent.com/${repository}/${commit}/${encodedPath}`;
}

export function sourceGitHubUrl(repository, commit, path) {
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  return `https://github.com/${repository}/blob/${commit}/${encodedPath}`;
}

function xmlEscape(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function buildSitemap(entries, origin = "https://deez.run") {
  const urls = new Set(["/", "/nuts", "/docs", "/publish"]);
  for (const entry of entries) {
    urls.add(`/nuts/${entry.slug}`);
    for (const author of entry.authors) urls.add(`/authors/${author.github}`);
  }

  const body = [...urls]
    .sort()
    .map((pathname) => `  <url><loc>${xmlEscape(new URL(pathname, origin).toString())}</loc></url>`)
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}
