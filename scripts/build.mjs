import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const baseManifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
const version = baseManifest.version;
const sharedFiles = [
  "background.js", "content.js", "content.css", "lib", "options", "popup"
];

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

function prepare(target, manifest, extraFiles = []) {
  const targetDirectory = join(dist, target);
  mkdirSync(targetDirectory, { recursive: true });
  for (const source of [...sharedFiles, ...extraFiles]) {
    cpSync(join(root, source), join(targetDirectory, source), { recursive: true });
  }
  writeFileSync(join(targetDirectory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return targetDirectory;
}

const chromeDirectory = prepare("chrome", baseManifest, ["offscreen"]);

const firefoxManifest = structuredClone(baseManifest);
delete firefoxManifest.minimum_chrome_version;
firefoxManifest.permissions = firefoxManifest.permissions.filter((permission) => permission !== "offscreen");
firefoxManifest.background = {
  scripts: ["lib/config.js", "lib/parser.js", "background.js"]
};
firefoxManifest.browser_specific_settings = {
  gecko: {
    id: "x-geoblock@dasemu.github.io",
    strict_min_version: "109.0"
  }
};
const firefoxDirectory = prepare("firefox", firefoxManifest);

function archive(directory, filename) {
  const result = spawnSync("zip", ["-q", "-r", join(dist, filename), "."], {
    cwd: directory,
    stdio: "inherit"
  });
  if (result.status !== 0) throw new Error(`zip failed for ${filename}`);
}

archive(chromeDirectory, `x-geoblock-chrome-v${version}.zip`);
archive(firefoxDirectory, `x-geoblock-firefox-v${version}.xpi`);
console.log(`Built Chromium ZIP and Firefox XPI for v${version}.`);
