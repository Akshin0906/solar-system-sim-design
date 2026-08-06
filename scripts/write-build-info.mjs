import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const outputDirectory = resolve(process.argv[2] ?? "dist");

const readGitCommit = () =>
  execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();

const readGitDirty = () =>
  execFileSync("git", ["status", "--porcelain=v1", "--untracked-files=normal"], {
    encoding: "utf8",
  }).trim().length > 0;

const parseDirty = (value) => {
  if (value === undefined) {
    return readGitDirty();
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  throw new Error('BUILD_DIRTY must be either "true" or "false" when provided.');
};

const commit = (process.env.BUILD_COMMIT ?? process.env.GITHUB_SHA ?? readGitCommit()).toLowerCase();
if (!/^[0-9a-f]{40}$/.test(commit)) {
  throw new Error("BUILD_COMMIT must be a full 40-character Git commit SHA.");
}

const repository = process.env.BUILD_REPOSITORY ?? process.env.GITHUB_REPOSITORY ?? null;
const ref = process.env.BUILD_REF ?? process.env.GITHUB_REF ?? null;
const runAttempt = process.env.BUILD_RUN_ATTEMPT ?? process.env.GITHUB_RUN_ATTEMPT ?? null;
const workflowRun =
  process.env.BUILD_RUN_URL ??
  (process.env.GITHUB_SERVER_URL && repository && process.env.GITHUB_RUN_ID
    ? `${process.env.GITHUB_SERVER_URL}/${repository}/actions/runs/${process.env.GITHUB_RUN_ID}`
    : null);
const dirty = parseDirty(process.env.BUILD_DIRTY);

const buildIdentity = {
  schemaVersion: 2,
  artifact: "github-pages",
  repository,
  commit,
  dirty,
  ref,
  workflowRun,
  runAttempt,
};

await mkdir(outputDirectory, { recursive: true });
await writeFile(
  resolve(outputDirectory, "build-info.json"),
  `${JSON.stringify(buildIdentity, null, 2)}\n`,
  "utf8",
);

console.log(`Wrote build-info.json for ${commit}${dirty ? " (dirty worktree)" : ""}.`);
