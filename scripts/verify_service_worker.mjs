import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const scriptDir = dirname(fileURLToPath(import.meta.url));
const generatorPath = join(scriptDir, "generate-service-worker.mjs");
const fixtureDir = await mkdtemp(join(tmpdir(), "solar-system-sw-"));
const manifestPath = join(fixtureDir, "manifest.webmanifest");
const serviceWorkerPath = join(fixtureDir, "service-worker.js");
const initialManifest = '{"name":"Solar"}\n';
const changedManifest = '{"name":"Lunar"}\n';
const initialTexture = "earth-texture-a\n";
const changedTexture = "earth-texture-b\n";
const marsTexture = "mars-texture-stable\n";

const generate = async (basePath = "/") => {
  await execFileAsync(process.execPath, [generatorPath, basePath, fixtureDir]);
  return readFile(serviceWorkerPath, "utf8");
};

const readCachePrefix = (source) => {
  const match = source.match(/const CACHE_PREFIX = "(solar-system-sim-[a-f0-9]{8}-)";/);
  assert.ok(match, "generated worker should scope its cache prefix to the deployment base path");
  return match[1];
};

const readCacheHash = (source) => {
  const match = source.match(/const CACHE_NAME = CACHE_PREFIX \+ "([a-f0-9]{12})";/);
  assert.ok(match, "generated worker should compose CACHE_NAME from the app prefix and build hash");
  return match[1];
};

const readPrecacheUrls = (source) => {
  const match = source.match(/const PRECACHE_URLS = (\[[\s\S]*?\]);\nconst PRECACHE_PATHS/);
  assert.ok(match, "generated worker should expose its shell precache allow-list");
  return JSON.parse(match[1]);
};

const readRuntimeTextureHashes = (source) => {
  const match = source.match(/const RUNTIME_TEXTURE_HASHES = new Map\((\[[\s\S]*?\])\);/);
  assert.ok(match, "generated worker should expose its bounded runtime texture identities");
  return new Map(JSON.parse(match[1]));
};

const hashContent = (content) => createHash("sha256").update(content).digest("hex");

try {
  assert.equal(
    Buffer.byteLength(initialManifest),
    Buffer.byteLength(changedManifest),
    "fixture updates must have identical byte lengths",
  );

  await Promise.all([
    mkdir(join(fixtureDir, "assets"), { recursive: true }),
    mkdir(join(fixtureDir, "icons"), { recursive: true }),
    mkdir(join(fixtureDir, "textures"), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(
      join(fixtureDir, "index.html"),
      '<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src \'self\'; connect-src \'self\';"><title>Solar system</title>\n',
    ),
    writeFile(join(fixtureDir, "build-info.json"), '{"commit":"test"}\n'),
    writeFile(manifestPath, initialManifest),
    writeFile(join(fixtureDir, "assets", "index-test.js"), "console.log('solar');\n"),
    writeFile(join(fixtureDir, "icons", "solar.svg"), "<svg></svg>\n"),
    writeFile(join(fixtureDir, "textures", "earth.jpg"), initialTexture),
    writeFile(join(fixtureDir, "textures", "mars.jpg"), marsTexture),
  ]);

  const initialWorker = await generate();
  const precacheUrls = readPrecacheUrls(initialWorker);
  const runtimeTextureHashes = readRuntimeTextureHashes(initialWorker);
  assert.deepEqual(
    precacheUrls,
    [
      "/",
      "/assets/index-test.js",
      "/build-info.json",
      "/icons/solar.svg",
      "/index.html",
      "/manifest.webmanifest",
    ],
    "install should precache application metadata and the shell, but not multi-megabyte textures",
  );
  assert.deepEqual(
    [...runtimeTextureHashes],
    [
      ["/textures/earth.jpg", hashContent(initialTexture)],
      ["/textures/mars.jpg", hashContent(marsTexture)],
    ],
    "only authored textures and their exact content identities should be runtime-cacheable",
  );
  assert.match(
    initialWorker,
    /const TEXTURE_CACHE_NAME = CACHE_PREFIX \+ "textures-v2";/,
    "the content-addressed texture cache should use the migrated cache schema",
  );
  assert.match(
    initialWorker,
    /key\.startsWith\(CACHE_PREFIX\) && key !== CACHE_NAME && key !== TEXTURE_CACHE_NAME/,
    "activation should retain the current shell and runtime texture caches",
  );
  assert.doesNotMatch(
    initialWorker,
    /\.filter\(\(key\) => key !== CACHE_NAME\)/,
    "activation must not delete unrelated origin caches",
  );
  assert.match(
    initialWorker,
    /LEGACY_CACHE_PATTERN\.test\(key\)[\s\S]*legacyCache\.match\(`\$\{BASE_PATH\}index\.html`\)[\s\S]*caches\.delete\(key\)/,
    "legacy migration should delete an unscoped cache only after matching this deployment's shell",
  );
  assert.match(
    initialWorker,
    /if \(url\.search\) \{[\s\S]*return;[\s\S]*const textureCacheKey = getTextureCacheKey\(url\)/,
    "runtime caching should ignore query variants before considering known textures",
  );
  assert.match(
    initialWorker,
    /RUNTIME_TEXTURE_HASHES\.get\(url\.pathname\)[\s\S]*searchParams\.set\(TEXTURE_CACHE_HASH_PARAM, contentHash\)/,
    "runtime texture cache keys should include the generated content hash",
  );
  assert.match(
    initialWorker,
    /caches\.open\(TEXTURE_CACHE_NAME\)[\s\S]*cache\.match\(textureCacheKey\)[\s\S]*fetch\(textureCacheKey\)[\s\S]*cache\.put\(textureCacheKey, response\.clone\(\)\)/,
    "known textures should use the content-addressed key for lookup, fetch, and storage",
  );
  assert.match(
    initialWorker,
    /cache\.keys\(\)[\s\S]*getTextureCacheKey\(new URL\(request\.url\)\) === request\.url[\s\S]*cache\.delete\(request\)/,
    "activation should prune removed textures and superseded same-path content identities",
  );
  assert.match(
    initialWorker,
    /if \(!PRECACHE_PATHS\.has\(url\.pathname\)\) \{[\s\S]*return;/,
    "the shell cache should ignore unknown same-origin paths",
  );
  assert.match(
    initialWorker,
    /caches\.open\(CACHE_NAME\)[\s\S]*cache\.match\(event\.request\)/,
    "runtime lookups should stay inside this deployment's named cache",
  );
  assert.match(
    initialWorker,
    /fetch\(event\.request\)\.catch\(\(\) =>[\s\S]*caches\.open\(CACHE_NAME\)[\s\S]*cache\.match/,
    "offline navigation fallback should stay inside this deployment's named cache",
  );

  const initialHash = readCacheHash(initialWorker);
  const rootPrefix = readCachePrefix(initialWorker);
  const previewPrefix = readCachePrefix(await generate("/preview/"));
  assert.notEqual(previewPrefix, rootPrefix, "different base paths must own isolated cache namespaces");
  await writeFile(manifestPath, changedManifest);
  const changedHash = readCacheHash(await generate());

  assert.notEqual(changedHash, initialHash, "same-size content changes should produce a new cache name");
  await Promise.all([
    writeFile(manifestPath, initialManifest),
    writeFile(join(fixtureDir, "textures", "earth.jpg"), changedTexture),
  ]);
  const textureChangedWorker = await generate();
  const textureChangedHash = readCacheHash(textureChangedWorker);
  const textureChangedHashes = readRuntimeTextureHashes(textureChangedWorker);
  assert.notEqual(
    textureChangedHash,
    initialHash,
    "same-name runtime texture changes should still publish a new worker build hash",
  );
  assert.notEqual(
    textureChangedHashes.get("/textures/earth.jpg"),
    runtimeTextureHashes.get("/textures/earth.jpg"),
    "a changed same-path texture must receive a different runtime cache identity",
  );
  assert.equal(
    textureChangedHashes.get("/textures/mars.jpg"),
    runtimeTextureHashes.get("/textures/mars.jpg"),
    "an unchanged texture should keep a reusable runtime cache identity across releases",
  );
  console.log(
    "Service worker shell precache, content-addressed texture cache, ownership, and hashing verified.",
  );
} finally {
  await rm(fixtureDir, { recursive: true, force: true });
}
