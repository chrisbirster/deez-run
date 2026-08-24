import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  compareSemver,
  parseNut,
  rawGitHubUrl,
  sha256,
  sourceGitHubUrl,
  validateRegistryEntry,
} from "./registry-lib.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const registryDir = path.join(root, "registry", "nuts");
const outputPath = path.join(root, "src", "generated", "catalog.json");
const checkOnly = process.argv.includes("--check");

async function loadEntries() {
  const files = (await readdir(registryDir)).filter((file) => file.endsWith(".json")).sort();
  const entries = [];
  const slugs = new Set();

  for (const file of files) {
    const fullPath = path.join(registryDir, file);
    const entry = validateRegistryEntry(JSON.parse(await readFile(fullPath, "utf8")), file);
    if (file !== `${entry.slug}.json`) throw new Error(`${file}: filename must equal ${entry.slug}.json`);
    if (slugs.has(entry.slug)) throw new Error(`duplicate slug ${entry.slug}`);
    slugs.add(entry.slug);

    const versions = [];
    for (const version of entry.versions) {
      const rawUrl = rawGitHubUrl(entry.source.repository, version.commit, version.path);
      const response = await fetch(rawUrl, {
        headers: { "user-agent": "deez.run-registry-validator/1" },
        redirect: "follow",
      });
      if (!response.ok) throw new Error(`${entry.slug}@${version.version}: source returned HTTP ${response.status}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      const digest = sha256(bytes);
      if (digest !== version.sha256) throw new Error(`${entry.slug}@${version.version}: SHA-256 mismatch; expected ${version.sha256}, got ${digest}`);

      let text;
      try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      } catch {
        throw new Error(`${entry.slug}@${version.version}: .nut is not valid UTF-8`);
      }
      const derived = parseNut(text);
      versions.push({
        ...version,
        raw_url: rawUrl,
        source_url: sourceGitHubUrl(entry.source.repository, version.commit, version.path),
        size_bytes: bytes.length,
        ...derived,
      });
    }

    versions.sort((a, b) => compareSemver(b.version, a.version));
    entries.push({
      schema_version: entry.schema_version,
      slug: entry.slug,
      name: entry.name,
      description: entry.description,
      authors: entry.authors,
      tags: [...entry.tags].sort(),
      license: entry.license ?? null,
      source: entry.source,
      latest: versions[0],
      versions,
    });
  }

  entries.sort((a, b) => a.name.localeCompare(b.name) || a.slug.localeCompare(b.slug));
  return { schema_version: 1, entries };
}

try {
  const catalog = await loadEntries();
  const serialized = `${JSON.stringify(catalog, null, 2)}\n`;
  if (!checkOnly) await writeFile(outputPath, serialized, "utf8");
  console.log(`registry: validated ${catalog.entries.length} nut${catalog.entries.length === 1 ? "" : "s"}${checkOnly ? "" : " and generated catalog"}`);
} catch (error) {
  console.error(`registry: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
