#!/usr/bin/env node

/**
 * Copy the extension's source into example/ at the same path `quarto add`
 * installs it to, so the example exercises the real code and its manifest
 * needs no edits. Dependencies are excluded; the example installs its own.
 *
 * With --check, report a difference instead of fixing it. CI runs that so the
 * copy cannot drift from the source silently.
 */

import { cp, readdir, readFile, rm, stat } from "node:fs/promises";
import { join, relative } from "node:path";

const SOURCE = "_extensions/quarto-openapi";
const TARGET = "example/_extensions/posit-dev/quarto-openapi";

/** Installed dependencies are not part of the source the copy tracks. */
function isDependency(path: string): boolean {
  return path.split(/[\\/]/).includes("node_modules");
}

async function listFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(entry.parentPath, entry.name);
    if (isDependency(relative(dir, full))) continue;
    if ((await stat(full)).isFile()) files.push(relative(dir, full));
  }
  return files.sort();
}

async function differences(): Promise<string[]> {
  const [sourceFiles, targetFiles] = await Promise.all([
    listFiles(SOURCE),
    listFiles(TARGET).catch(() => [] as string[]),
  ]);
  const diffs: string[] = [];
  for (const name of targetFiles) {
    if (!sourceFiles.includes(name)) diffs.push(`only in example: ${name}`);
  }
  for (const name of sourceFiles) {
    if (!targetFiles.includes(name)) {
      diffs.push(`missing from example: ${name}`);
      continue;
    }
    const [a, b] = await Promise.all([
      readFile(join(SOURCE, name)),
      readFile(join(TARGET, name)),
    ]);
    if (!a.equals(b)) diffs.push(`differs: ${name}`);
  }
  return diffs;
}

const check = process.argv.includes("--check");
const diffs = await differences();

if (diffs.length === 0) {
  console.log(`${TARGET} is in sync with ${SOURCE}`);
} else if (check) {
  console.error(`${TARGET} is out of sync with ${SOURCE}:`);
  for (const diff of diffs) console.error(`  ${diff}`);
  console.error("Run `npm run sync-example` to update it.");
  process.exit(1);
} else {
  await rm(TARGET, { recursive: true, force: true });
  await cp(SOURCE, TARGET, {
    recursive: true,
    filter: (src) => !isDependency(relative(SOURCE, src)),
  });
  console.log(`Synced ${TARGET} from ${SOURCE} (${diffs.length} changes)`);
}
