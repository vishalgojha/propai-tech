#!/usr/bin/env node
import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const BUMP_TYPES = new Set(["patch", "minor", "major"]);
const rootDir = process.cwd();
const packageJsonPath = path.join(rootDir, "package.json");
const lockFilePath = path.join(rootDir, "package-lock.json");
const changelogPath = path.join(rootDir, "CHANGELOG.md");

const options = parseArgs(process.argv.slice(2));
const packageJson = readJson(packageJsonPath);
const currentVersion = packageJson.version;
const nextVersion = bumpVersion(currentVersion, options.bump);

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`release failed: ${message}`);
  process.exit(1);
});

async function main() {
  assertGitRepo();
  assertCleanWorktree();

  if (options.check) {
    console.log(`Release check passed.`);
    console.log(`Current version: ${currentVersion}`);
    console.log(`Next version (${options.bump}): ${nextVersion}`);
    return;
  }

  if (!options.skipTests) {
    runAction("npm test");
  }

  updateVersionFiles(nextVersion);
  updateChangelog(nextVersion);

  runAction("git add package.json package-lock.json CHANGELOG.md");
  runAction(`git commit -m "chore(release): v${nextVersion}"`);
  runAction(`git tag v${nextVersion}`);

  if (!options.skipPush) {
    runAction("git push --follow-tags");
  } else {
    console.log("Skipping push (--skip-push).");
  }

  const privatePackage = Boolean(packageJson.private);
  if (privatePackage || options.skipPublish) {
    const reason = privatePackage ? "package.json has private=true" : "--skip-publish";
    console.log(`Skipping npm publish (${reason}).`);
  } else {
    runAction("npm publish");
  }

  if (options.dryRun) {
    console.log("Dry run complete. No files were changed.");
  } else {
    console.log(`Release complete: v${nextVersion}`);
  }
}

function parseArgs(args) {
  const parsed = {
    bump: "patch",
    dryRun: false,
    check: false,
    skipPush: false,
    skipPublish: false,
    skipTests: false
  };

  for (const arg of args) {
    if (BUMP_TYPES.has(arg)) {
      parsed.bump = arg;
      continue;
    }

    if (arg === "--dry-run") {
      parsed.dryRun = true;
      continue;
    }

    if (arg === "--check") {
      parsed.check = true;
      continue;
    }

    if (arg === "--skip-push") {
      parsed.skipPush = true;
      continue;
    }

    if (arg === "--skip-publish") {
      parsed.skipPublish = true;
      continue;
    }

    if (arg === "--skip-tests") {
      parsed.skipTests = true;
      continue;
    }

    throw new Error(
      `Unknown argument: ${arg}. Use: [patch|minor|major] [--dry-run] [--check] [--skip-push] [--skip-publish] [--skip-tests]`
    );
  }

  return parsed;
}

function assertGitRepo() {
  try {
    const result = execSync("git rev-parse --is-inside-work-tree", {
      cwd: rootDir,
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf8"
    })
      .trim()
      .toLowerCase();
    if (result !== "true") {
      throw new Error("Not inside a git repository.");
    }
  } catch {
    throw new Error("Not inside a git repository.");
  }
}

function assertCleanWorktree() {
  const status = execSync("git status --porcelain", {
    cwd: rootDir,
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8"
  }).trim();

  if (status.length > 0) {
    throw new Error("Worktree must be clean before running release.");
  }
}

function runAction(command) {
  if (options.dryRun) {
    console.log(`[dry-run] ${command}`);
    return;
  }

  console.log(`> ${command}`);
  execSync(command, {
    cwd: rootDir,
    stdio: "inherit",
    env: process.env
  });
}

function updateVersionFiles(version) {
  if (!existsSync(lockFilePath)) {
    throw new Error("package-lock.json not found. Release requires npm lockfile.");
  }

  const pkg = readJson(packageJsonPath);
  const lock = readJson(lockFilePath);
  pkg.version = version;
  lock.version = version;
  if (lock.packages && lock.packages[""]) {
    lock.packages[""].version = version;
  }

  if (options.dryRun) {
    console.log(`[dry-run] update package.json version ${currentVersion} -> ${version}`);
    console.log(`[dry-run] update package-lock.json version ${currentVersion} -> ${version}`);
    return;
  }

  writeJson(packageJsonPath, pkg);
  writeJson(lockFilePath, lock);
}

function updateChangelog(version) {
  const today = new Date().toISOString().slice(0, 10);
  const previousTag = findLatestTag();
  const range = previousTag ? `${previousTag}..HEAD` : "HEAD";
  const commitsRaw = execSync(`git log --pretty=format:"- %s" ${range}`, {
    cwd: rootDir,
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8"
  }).trim();

  const commits = commitsRaw.length > 0 ? commitsRaw : "- internal maintenance changes";
  const entry = `## v${version} - ${today}\n${commits}\n\n`;

  const existing = existsSync(changelogPath)
    ? readFileSync(changelogPath, "utf8")
    : "";

  if (existing.includes(`## v${version} `) || existing.includes(`## v${version}\n`)) {
    throw new Error(`CHANGELOG.md already contains v${version}.`);
  }

  const stripped = existing.replace(/^# Changelog\s*/i, "").trimStart();
  const nextContent = `# Changelog\n\n${entry}${stripped}`;

  if (options.dryRun) {
    console.log(`[dry-run] prepend CHANGELOG.md entry for v${version}`);
    return;
  }

  writeFileSync(changelogPath, nextContent, "utf8");
}

function findLatestTag() {
  try {
    return execSync("git describe --tags --abbrev=0", {
      cwd: rootDir,
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf8"
    }).trim();
  } catch {
    return "";
  }
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function bumpVersion(version, bumpType) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) {
    throw new Error(`Unsupported version "${version}". Use semver x.y.z format.`);
  }

  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);

  if (bumpType === "major") {
    return `${major + 1}.0.0`;
  }
  if (bumpType === "minor") {
    return `${major}.${minor + 1}.0`;
  }
  return `${major}.${minor}.${patch + 1}`;
}
