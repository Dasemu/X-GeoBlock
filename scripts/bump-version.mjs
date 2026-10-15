import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const kind = process.argv[2];
if (!new Set(["patch", "minor"]).has(kind)) {
  console.error("Usage: node scripts/bump-version.mjs <patch|minor>");
  process.exit(2);
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = resolve(root, "manifest.json");
const packagePath = resolve(root, "package.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(manifest.version);
if (!match) throw new Error(`Unsupported version: ${manifest.version}`);

let [, major, minor, patch] = match.map(Number);
if (kind === "minor") {
  minor += 1;
  patch = 0;
} else {
  patch += 1;
}
const version = `${major}.${minor}.${patch}`;
manifest.version = version;
packageJson.version = version;
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
console.log(version);
