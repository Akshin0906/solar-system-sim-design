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
const cacheScopeHash = createHash("sha256").update(basePath).digest("hex").slice(0, 8);

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

const serviceWorker = `const CACHE_PREFIX = "solar-system-sim-${cacheScopeHash}-";
const CACHE_NAME = CACHE_PREFIX + "${cacheHash}";
const LEGACY_CACHE_PATTERN = /^solar-system-sim-[a-f0-9]{12}$/;
const BASE_PATH = ${JSON.stringify(basePath)};
const PRECACHE_URLS = ${JSON.stringify(precacheUrls, null, 2)};
const PRECACHE_PATHS = new Set(PRECACHE_URLS);

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
          keys.map(async (key) => {
            if (key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME) {
              return caches.delete(key);
            }

            // Before base-path scoping was introduced, builds used the unscoped
            // solar-system-sim-<hash> namespace. Remove only a legacy cache that
            // proves it belongs to this deployment by containing this base's shell;
            // sibling previews and unrelated caches on the origin remain untouched.
            if (LEGACY_CACHE_PATTERN.test(key)) {
              const legacyCache = await caches.open(key);
              if (await legacyCache.match(\`\${BASE_PATH}index.html\`)) {
                return caches.delete(key);
              }
            }

            return false;
          }),
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
    event.respondWith(
      fetch(event.request).catch(() =>
        caches.open(CACHE_NAME).then((cache) => cache.match(\`\${BASE_PATH}index.html\`)),
      ),
    );
    return;
  }

  // The build already knows every offline asset. Do not turn this worker into an
  // origin-wide, unbounded cache for future API/private responses or query variants.
  if (url.search || !PRECACHE_PATHS.has(url.pathname)) {
    return;
  }

  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      cache.match(event.request).then((cached) => {
        if (cached) {
          return cached;
        }

        return fetch(event.request).then((response) => {
          if (!response || response.status !== 200 || response.type !== "basic") {
            return response;
          }

          const cacheControl = response.headers.get("Cache-Control") ?? "";
          if (/no-store/i.test(cacheControl)) {
            return response;
          }

          cache.put(event.request, response.clone());
          return response;
        });
      }),
    ),
  );
});
`;

await writeFile(join(distDir, "service-worker.js"), serviceWorker);
console.log(`Generated service worker with ${precacheUrls.length} precached URLs.`);
