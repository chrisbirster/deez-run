import assert from "node:assert/strict";

const { default: app } = await import("../dist/server/server.js");

async function page(pathname) {
  const response = await app.fetch(
    new Request(`https://deez.run${pathname}`, {
      headers: { accept: "text/html" },
    }),
  );
  const html = await response.text();
  assert.equal(response.status, 200, `${pathname} should render successfully`);
  assert.match(response.headers.get("content-type") ?? "", /text\/html/);
  assert.match(response.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("referrer-policy"), "strict-origin-when-cross-origin");
  return html;
}

const home = await page("/");
assert.match(home, /Find a nut\. Learn it locally\./);
assert.match(home, /<title[^>]*>deez\.run<\/title>/);
assert.match(home, /https:\/\/deez\.run\//);

const nuts = await page("/nuts");
assert.match(nuts, /Public nuts/);
assert.match(nuts, /https:\/\/deez\.run\/nuts/);

const docs = await page("/docs");
assert.match(docs, /How deez\.run fits Deez/);
assert.match(docs, /Docs · deez\.run/);
assert.match(docs, /https:\/\/deez\.run\/docs/);

const search = await page("/search?q=zig");
assert.match(search, /Search the registry/);
assert.match(search, /noindex,follow/);

console.log("ssr smoke: home, nuts, docs, search, metadata, and security headers passed");
