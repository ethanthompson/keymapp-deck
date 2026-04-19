#!/usr/bin/env node
/**
 * Packages the sdPlugin directory into a distributable .streamDeckPlugin file
 * (which is just a ZIP renamed with that extension).
 *
 * Usage: node scripts/pack-plugin.mjs
 */

import { createWriteStream, mkdirSync, readdirSync, statSync, readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execFileSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const PLUGIN_DIR = "com.ethanthompson.keymapp-layers.sdPlugin";
const OUT_DIR = path.join(ROOT, "dist");
const OUT_FILE = path.join(OUT_DIR, `${PLUGIN_DIR.replace(".sdPlugin", "")}.streamDeckPlugin`);

mkdirSync(OUT_DIR, { recursive: true });

// Read version from package.json for informational output.
const pkg = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8"));
console.log(`Packaging ${PLUGIN_DIR} v${pkg.version}…`);

// Use system zip (macOS/Linux) or PowerShell Compress-Archive (Windows).
// PowerShell's Compress-Archive only accepts .zip; we zip first then rename.
if (process.platform === "win32") {
  const tmpZip = OUT_FILE.replace(/\.streamDeckPlugin$/, ".zip");
  execFileSync(
    "powershell",
    [
      "-Command",
      `Compress-Archive -Force -Path "${path.join(ROOT, PLUGIN_DIR)}" -DestinationPath "${tmpZip}"`,
    ],
    { stdio: "inherit", cwd: ROOT }
  );
  // Rename .zip → .streamDeckPlugin
  execFileSync(
    "powershell",
    ["-Command", `Move-Item -Force -Path "${tmpZip}" -Destination "${OUT_FILE}"`],
    { stdio: "inherit", cwd: ROOT }
  );
} else {
  execFileSync(
    "zip",
    ["-r", "--symlinks", OUT_FILE, PLUGIN_DIR, "--exclude", `${PLUGIN_DIR}/bin/*.map`],
    { stdio: "inherit", cwd: ROOT }
  );
}

console.log(`\n✓ Created ${path.relative(ROOT, OUT_FILE)}`);
console.log("  Double-click this file on any machine with Stream Deck installed to install the plugin.");
