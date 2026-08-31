import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import * as stylex from "@stylexjs/stylex";

test("StyleX attrs uses the Solid-compatible class key", () => {
  const attrs = stylex.attrs({ color: "xsolidstylex", $$css: true });

  assert.equal(attrs.class, "xsolidstylex");
  assert.equal("className" in attrs, false);
});

test("Solid TSX never spreads React-shaped StyleX props", () => {
  const files = readdirSync("src", { recursive: true })
    .filter((file) => typeof file === "string" && file.endsWith(".tsx"));

  for (const file of files) {
    const source = readFileSync(join("src", file), "utf8");
    assert.doesNotMatch(
      source,
      /stylex\.props\s*\(/,
      `${file} must use stylex.attrs(...) so Solid receives a class attribute`,
    );
  }
});
