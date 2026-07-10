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

const generate = async () => {
  await execFileAsync(process.execPath, [generatorPath, "/", fixtureDir]);
  return readFile(serviceWorkerPath, "utf8");
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
    /\.filter\(\(key\) => key\.startsWith\(CACHE_PREFIX\) && key !== CACHE_NAME\)/,
    "activation should delete only stale caches owned by this app",
  );
  assert.doesNotMatch(
    initialWorker,
    /\.filter\(\(key\) => key !== CACHE_NAME\)/,
    "activation must not delete unrelated origin caches",
  );

  const initialHash = readCacheHash(initialWorker);
  await writeFile(manifestPath, changedManifest);
  const changedHash = readCacheHash(await generate());

  assert.notEqual(changedHash, initialHash, "same-size content changes should produce a new cache name");
  console.log("Service worker cache ownership and content hashing verified.");
} finally {
  await rm(fixtureDir, { recursive: true, force: true });
}
