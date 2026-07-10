import { readFile, readdir, writeFile } from "node:fs/promises";
import { extname, join, relative, resolve, sep } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const defaultDistDir = fileURLToPath(new URL("../dist/", import.meta.url));
const distDir = resolve(process.argv[3] ?? defaultDistDir);
const cacheableExtensions = new Set([
  ".css",
  ".html",
  ".jpeg",
  ".jpg",
  ".js",
  ".json",
  ".png",
  ".svg",
  ".txt",
  ".webmanifest",
  ".webp",
  ".wasm",
]);
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

const files = await walk(distDir);
const records = await Promise.all(
  files.map(async (file) => {
    const content = await readFile(file);
    const publicPath = toPublicPath(relative(distDir, file).split(sep).join("/"));
    const contentHash = createHash("sha256").update(content).digest("hex");
    return { publicPath, contentHash };
  }),
);

const precacheUrls = [basePath, ...records.map((record) => record.publicPath)].sort();
// Include each file's bytes, not just its path or size. Public assets such as the
// manifest and icons do not have Vite content hashes in their filenames, and a
// same-size edit must still produce a fresh cache.
const cacheHash = createHash("sha256")
  .update(records.map((record) => `${record.publicPath}:${record.contentHash}`).sort().join("|"))
  .digest("hex")
  .slice(0, 12);

const serviceWorker = `const CACHE_PREFIX = "solar-system-sim-";
const CACHE_NAME = CACHE_PREFIX + "${cacheHash}";
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
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
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

await writeFile(join(distDir, "service-worker.js"), serviceWorker);
console.log(`Generated service worker with ${precacheUrls.length} precached URLs.`);
