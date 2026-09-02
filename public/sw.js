const CACHE_VERSION = "deez-plane-v2";
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const MEDIA_CACHE = `${CACHE_VERSION}-media`;
const SHELL = ["/", "/app", "/manifest.webmanifest"];

function assetUrls(html) {
  const found = new Set();
  for (const match of html.matchAll(/(?:src|href)=["'](\/assets\/[^"']+)["']/g)) found.add(match[1]);
  return [...found];
}

async function primeShell() {
  const cache = await caches.open(SHELL_CACHE);
  let appHtml = "";
  for (const url of SHELL) {
    const response = await fetch(url, { credentials: "same-origin", cache: "no-store" });
    if (!response.ok) throw new Error(`Unable to cache ${url}: ${response.status}`);
    if (url === "/app") appHtml = await response.clone().text();
    await cache.put(url, response);
  }
  const assets = assetUrls(appHtml);
  await Promise.all(assets.map(async (url) => {
    const response = await fetch(url, { credentials: "same-origin", cache: "no-store" });
    if (!response.ok) throw new Error(`Unable to cache ${url}: ${response.status}`);
    await cache.put(url, response);
  }));
}

self.addEventListener("install", (event) => {
  event.waitUntil(primeShell().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith("deez-plane-") && name !== SHELL_CACHE && name !== MEDIA_CACHE).map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

async function navigation(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(SHELL_CACHE);
      await cache.put("/app", response.clone());
    }
    return response;
  } catch {
    return (await caches.match("/app")) || (await caches.match("/")) || Response.error();
  }
}

async function staticAsset(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(SHELL_CACHE);
    await cache.put(request, response.clone());
  }
  return response;
}

async function media(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(MEDIA_CACHE);
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    return (await caches.match(request)) || Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(navigation(request));
    return;
  }

  if (url.pathname.startsWith("/api/v1/media/")) {
    event.respondWith(media(request));
    return;
  }

  if (url.pathname.startsWith("/api/")) return;

  if (url.pathname.startsWith("/assets/") || url.pathname === "/manifest.webmanifest") {
    event.respondWith(staticAsset(request));
  }
});
