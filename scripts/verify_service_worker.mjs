import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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

try {
  assert.equal(
    Buffer.byteLength(initialManifest),
    Buffer.byteLength(changedManifest),
    "fixture updates must have identical byte lengths",
  );

  await Promise.all([
    writeFile(join(fixtureDir, "index.html"), "<!doctype html><title>Solar system</title>\n"),
    writeFile(manifestPath, initialManifest),
  ]);

  const initialWorker = await generate();
  assert.match(
    initialWorker,
    /if \(key\.startsWith\(CACHE_PREFIX\) && key !== CACHE_NAME\)/,
    "activation should delete only stale caches owned by this app",
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
    /if \(url\.search \|\| !PRECACHE_PATHS\.has\(url\.pathname\)\)/,
    "runtime caching should ignore query variants and non-build paths",
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
  console.log("Service worker cache ownership and content hashing verified.");
} finally {
  await rm(fixtureDir, { recursive: true, force: true });
}
