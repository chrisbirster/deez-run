import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const study = fs.readFileSync(new URL("../src/studyPage.tsx", import.meta.url), "utf8");
const interaction = fs.readFileSync(new URL("../src/studyInteraction.tsx", import.meta.url), "utf8");
const appApi = fs.readFileSync(new URL("../src/appApi.ts", import.meta.url), "utf8");
const patch = fs.readFileSync(new URL("../patches/patch-study-completeness.py", import.meta.url), "utf8");
const dockerfile = fs.readFileSync(new URL("../Dockerfile", import.meta.url), "utf8");
const sanitizer = fs.readFileSync(new URL("../src/cardMarkup.ts", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../src/studyCompleteness.css", import.meta.url), "utf8");

test("Study renders every current interaction contract without bypassing the sanitizer", () => {
  for (const type of ["type_answer", "single_choice", "multiple_choice", "ordering", "image_occlusion"]) {
    assert.match(interaction, new RegExp(`type === \\"${type}\\"`));
  }
  assert.match(study, /safeCardMarkup\(revealed\(\) \? current\(\)\.rendered\.back : current\(\)\.rendered\.front\)/);
  assert.doesNotMatch(interaction, /innerHTML=/);
  assert.match(sanitizer, /droppedTags = new Set\(\["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "SVG", "MATH"\]\)/);
});

test("image occlusion only resolves Deez media or same-origin paths", () => {
  assert.match(interaction, /deez-media:\/\/sha256:/);
  assert.match(interaction, /\/api\/v1\/media\/\$\{hash\}/);
  assert.match(interaction, /reference\.startsWith\("\/"\) && !reference\.startsWith\("\/\/"\)/);
  assert.doesNotMatch(interaction, /https?:\/\//);
});

test("Study exposes presets, goals, bury, history, and keyboard affordances", () => {
  for (const label of ["Due all", "Quick 10", "Reviews only", "New 10", "Mixed 20"]) assert.match(study, new RegExp(label));
  assert.match(study, /Session goal/);
  assert.match(study, /Bury for session/);
  assert.match(study, /event\.key === "b" \|\| event\.key === "B"/);
  assert.match(study, /Card history & scheduler/);
  assert.match(study, /RELEARNING/);
  assert.match(study, /Goal reached\./);
});

test("session bury is excluded in both cloud and offline queue selection", () => {
  assert.match(appApi, /excludeCardIds\?: string\[\]/);
  assert.match(appApi, /exclude_card_ids/);
  assert.match(appApi, /offlineStudyNext/);
  assert.match(appApi, /excluded\.has\(card\.id\)/);
  assert.match(patch, /excluded_card_ids/);
  assert.match(patch, /self\.isExcluded\(card\.id\)/);
  assert.match(patch, /2_000/);
  assert.match(dockerfile, /patch-study-completeness\.py/);
  assert.match(dockerfile, /src\/study\.zig src\/web_study\.zig/);
});

test("M4 Study controls remain responsive and reduced-motion aware", () => {
  assert.match(css, /@media \(max-width: 640px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /study-presets/);
  assert.match(css, /rating-grid/);
});
