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
const isRuntimeTexture = (path) => path.startsWith("textures/");

const assertStaticProductionCsp = async () => {
  const indexHtml = await readFile(join(distDir, "index.html"), "utf8");
  if (indexHtml.includes("__CSP_CONNECT_SOURCES__")) {
    throw new Error("Production index still contains the unresolved CSP placeholder.");
  }

  const csp = indexHtml.match(/http-equiv="Content-Security-Policy"[\s\S]*?content="([^"]+)"/)?.[1];
  if (!csp || !csp.includes("connect-src 'self';")) {
    throw new Error("Production index must restrict connect-src to the deployment origin.");
  }
  if (/\b(?:ws|wss):/.test(csp)) {
    throw new Error("Production index must not permit arbitrary WebSocket origins.");
  }
};

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

await assertStaticProductionCsp();
const files = await walk(distDir);
const records = await Promise.all(
  files.map(async (file) => {
    const content = await readFile(file);
    const relativePath = relative(distDir, file).split(sep).join("/");
    const publicPath = toPublicPath(relativePath);
    const contentHash = createHash("sha256").update(content).digest("hex");
    return { relativePath, publicPath, contentHash };
  }),
);

// Keep installation light: the application shell is available offline immediately,
// while multi-megabyte planet textures are cached only after a visitor actually opens
// the corresponding close-up. Runtime texture identities remain an authored,
// bounded set, and their content hashes make cached responses immutable.
const runtimeTextureEntries = records
  .filter((record) => isRuntimeTexture(record.relativePath))
  .map((record) => [record.publicPath, record.contentHash])
  .sort(([leftPath], [rightPath]) => leftPath.localeCompare(rightPath));
const precacheUrls = [
  basePath,
  ...records.filter((record) => !isRuntimeTexture(record.relativePath)).map((record) => record.publicPath),
].sort();
// Include each file's bytes, not just its path or size. Public assets such as the
// manifest and icons do not have Vite content hashes in their filenames, and a
// same-size edit must still produce a fresh cache.
const cacheHash = createHash("sha256")
  .update(records.map((record) => `${record.publicPath}:${record.contentHash}`).sort().join("|"))
  .digest("hex")
  .slice(0, 12);

const serviceWorker = `const CACHE_PREFIX = "solar-system-sim-${cacheScopeHash}-";
const CACHE_NAME = CACHE_PREFIX + "${cacheHash}";
const TEXTURE_CACHE_NAME = CACHE_PREFIX + "textures-v2";
const TEXTURE_CACHE_HASH_PARAM = "__solar_texture";
const LEGACY_CACHE_PATTERN = /^solar-system-sim-[a-f0-9]{12}$/;
const BASE_PATH = ${JSON.stringify(basePath)};
const PRECACHE_URLS = ${JSON.stringify(precacheUrls, null, 2)};
const PRECACHE_PATHS = new Set(PRECACHE_URLS);
const RUNTIME_TEXTURE_HASHES = new Map(${JSON.stringify(runtimeTextureEntries, null, 2)});

const getTextureCacheKey = (url) => {
  const contentHash = RUNTIME_TEXTURE_HASHES.get(url.pathname);
  if (!contentHash) {
    return null;
  }

  const cacheKey = new URL(url.origin + url.pathname);
  cacheKey.searchParams.set(TEXTURE_CACHE_HASH_PARAM, contentHash);
  return cacheKey.href;
};

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
    Promise.all([
      caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys.map(async (key) => {
              if (key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME && key !== TEXTURE_CACHE_NAME) {
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
        ),
      caches.open(TEXTURE_CACHE_NAME).then((cache) =>
        cache.keys().then((requests) =>
          Promise.all(
            requests.map((request) =>
              getTextureCacheKey(new URL(request.url)) === request.url
                ? false
                : cache.delete(request),
            ),
          ),
        ),
      ),
    ])
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

  // Ignore query variants so tracking/debug parameters cannot create an unbounded cache.
  if (url.search) {
    return;
  }

  const textureCacheKey = getTextureCacheKey(url);
  if (textureCacheKey) {
    event.respondWith(
      caches.open(TEXTURE_CACHE_NAME).then((cache) =>
        cache.match(textureCacheKey).then((cached) => {
          if (cached) {
            return cached;
          }

          // The content hash in this request bypasses any HTTP-cache entry for an
          // older same-path texture. It is also the Cache Storage identity, so an
          // unchanged texture remains safely reusable across releases.
          return fetch(textureCacheKey).then((response) => {
            if (!response || response.status !== 200 || response.type !== "basic") {
              return response;
            }

            const cacheControl = response.headers.get("Cache-Control") ?? "";
            if (/no-store/i.test(cacheControl)) {
              return response;
            }

            return cache.put(textureCacheKey, response.clone()).then(() => response);
          });
        }),
      ),
    );
    return;
  }

  // The shell cache is an exact allow-list. Unknown same-origin paths continue to use
  // normal browser/network behavior rather than expanding this worker's storage scope.
  if (!PRECACHE_PATHS.has(url.pathname)) {
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
console.log(
  `Generated service worker with ${precacheUrls.length} shell URLs and ${runtimeTextureEntries.length} runtime textures.`,
);
