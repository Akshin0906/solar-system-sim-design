import { readdir, stat, writeFile } from "node:fs/promises";
import { extname, join, relative, sep } from "node:path";
import { createHash } from "node:crypto";

const distDir = new URL("../dist/", import.meta.url);
const cacheableExtensions = new Set([".css", ".html", ".js", ".json", ".svg", ".txt", ".webmanifest", ".wasm"]);
const normalizeBasePath = (value) => {
  if (!value || value === ".") {
    return "/";
  }

  const withLeadingSlash = value.startsWith("/") ? value : `/${value}`;
  return withLeadingSlash.endsWith("/") ? withLeadingSlash : `${withLeadingSlash}/`;
};

const basePath = normalizeBasePath(process.argv[2]);
const toPublicPath = (path) => `${basePath}${path}`;

const walk = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await walk(path)));
      continue;
    }

    if (entry.name === "service-worker.js") {
      continue;
    }

    if (cacheableExtensions.has(extname(entry.name))) {
      files.push(path);
    }
  }

  return files;
};

const files = await walk(distDir.pathname);
const records = await Promise.all(
  files.map(async (file) => {
    const metadata = await stat(file);
    const publicPath = toPublicPath(relative(distDir.pathname, file).split(sep).join("/"));
    return { publicPath, size: metadata.size, modified: metadata.mtimeMs };
  }),
);

const precacheUrls = [basePath, ...records.map((record) => record.publicPath)].sort();
const cacheHash = createHash("sha256")
  .update(records.map((record) => `${record.publicPath}:${record.size}:${record.modified}`).sort().join("|"))
  .digest("hex")
  .slice(0, 12);

const serviceWorker = `const CACHE_NAME = "solar-system-sim-${cacheHash}";
const BASE_PATH = ${JSON.stringify(basePath)};
const PRECACHE_URLS = ${JSON.stringify(precacheUrls, null, 2)};

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  const url = new URL(event.request.url);

  if (url.origin !== self.location.origin) {
    return;
  }

  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).catch(() => caches.match(\`\${BASE_PATH}index.html\`)));
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        return cached;
      }

      return fetch(event.request).then((response) => {
        if (!response || response.status !== 200 || response.type !== "basic") {
          return response;
        }

        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      });
    }),
  );
});
`;

await writeFile(new URL("../dist/service-worker.js", import.meta.url), serviceWorker);
console.log(`Generated service worker with ${precacheUrls.length} precached URLs.`);
