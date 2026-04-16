#!/usr/bin/env node
/**
 * Downloads pre-built kontroll binaries from the zsa/kontroll GitHub releases
 * and places them in the sdPlugin/vendor/ directory.
 *
 * Usage: node scripts/download-kontroll.mjs
 */

import { createWriteStream, existsSync, mkdirSync, chmodSync, unlinkSync } from "fs";
import { pipeline } from "stream/promises";
import { createGunzip } from "zlib";
import path from "path";
import { fileURLToPath } from "url";
import https from "https";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VENDOR_DIR = path.join(__dirname, "..", "com.ethanthompson.keymapp-layers.sdPlugin", "vendor");
const RELEASES_API = "https://api.github.com/repos/zsa/kontroll/releases";

const TARGETS = [
  {
    platform: "macos",
    assetPattern: /kontroll-[\d.]+-macos-universal\.zip$/,
    outputName: "kontroll-macos",
  },
  {
    platform: "win-x64",
    assetPattern: /kontroll-[\d.]+-win-x64\.zip(\.zip)?$/,
    outputName: "kontroll-win-x64.exe",
  },
];

// ── helpers ──────────────────────────────────────────────────────────────────

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { "User-Agent": "kontroll-bridge-build" } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return resolve(httpsGet(res.headers.location));
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      resolve(res);
    });
    req.on("error", reject);
  });
}

async function fetchJson(url) {
  const res = await httpsGet(url);
  const chunks = [];
  for await (const chunk of res) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString());
}

async function downloadFile(url, destPath) {
  const res = await httpsGet(url);
  await pipeline(res, createWriteStream(destPath));
}

/**
 * Extract the single binary from a zip archive without needing an unzip binary.
 * We use Node's built-in zlib + a minimal ZIP parser (central-directory scan).
 */
async function extractBinaryFromZip(zipPath, outputPath) {
  // Use the system unzip if available (much simpler).
  const { execFileSync } = await import("child_process");
  const tmpDir = zipPath + "_extracted";
  mkdirSync(tmpDir, { recursive: true });

  try {
    execFileSync("unzip", ["-o", zipPath, "-d", tmpDir], { stdio: "pipe" });
  } catch {
    // On Windows, fall back to PowerShell expand-archive.
    try {
      execFileSync(
        "powershell",
        ["-Command", `Expand-Archive -Force "${zipPath}" "${tmpDir}"`],
        { stdio: "pipe" }
      );
    } catch (e) {
      throw new Error(`Could not extract zip: ${e.message}. Install unzip and retry.`);
    }
  }

  // Find the binary inside the extracted folder.
  const { readdirSync, statSync, renameSync } = await import("fs");
  function findExe(dir) {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) {
        const found = findExe(full);
        if (found) return found;
      } else if (
        entry === "kontroll" ||
        entry === "kontroll.exe" ||
        entry.startsWith("kontroll") && !entry.endsWith(".zip")
      ) {
        return full;
      }
    }
    return null;
  }

  const binaryPath = findExe(tmpDir);
  if (!binaryPath) throw new Error(`Could not find kontroll binary in extracted zip at ${tmpDir}`);

  renameSync(binaryPath, outputPath);

  // Cleanup.
  const { rmSync } = await import("fs");
  rmSync(tmpDir, { recursive: true, force: true });
}

// ── main ─────────────────────────────────────────────────────────────────────

mkdirSync(VENDOR_DIR, { recursive: true });

console.log("Fetching kontroll release list…");
const releases = await fetchJson(RELEASES_API);

for (const target of TARGETS) {
  const outputPath = path.join(VENDOR_DIR, target.outputName);

  if (existsSync(outputPath)) {
    console.log(`  ✓ ${target.outputName} already present, skipping.`);
    continue;
  }

  // Walk releases newest-first to find one that has this platform's asset.
  let asset = null;
  let foundRelease = null;
  for (const release of releases) {
    asset = release.assets?.find((a) => target.assetPattern.test(a.name));
    if (asset) {
      foundRelease = release;
      break;
    }
  }

  if (!asset) {
    console.warn(`  ⚠ No ${target.platform} asset found in any release. Skipping.`);
    continue;
  }

  console.log(`  ↓ Downloading ${asset.name} (${(asset.size / 1024 / 1024).toFixed(1)} MB) from release ${foundRelease.tag_name}…`);
  const zipPath = outputPath + ".zip";
  await downloadFile(asset.browser_download_url, zipPath);

  console.log(`    Extracting…`);
  await extractBinaryFromZip(zipPath, outputPath);
  unlinkSync(zipPath);

  if (process.platform !== "win32") {
    chmodSync(outputPath, 0o755);
  }

  console.log(`  ✓ ${target.outputName} ready.`);
}

console.log("\nAll kontroll binaries are in vendor/. Run `npm run build` next.");
