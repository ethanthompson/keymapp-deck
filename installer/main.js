"use strict";

const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { execFile, execFileSync, execFile: execFileRaw, spawn } = require("child_process");
const { promisify } = require("util");
const execFileAsync = promisify(execFileRaw);

// ── paths ─────────────────────────────────────────────────────────────────────

const PLUGIN_NAME = "com.ethanthompson.keymapp-layers.sdPlugin";

function getPluginsDir() {
  if (process.platform === "darwin") {
    return path.join(
      os.homedir(),
      "Library",
      "Application Support",
      "com.elgato.StreamDeck",
      "Plugins"
    );
  }
  if (process.platform === "win32") {
    return path.join(process.env.APPDATA || "", "Elgato", "StreamDeck", "Plugins");
  }
  throw new Error("Unsupported platform: " + process.platform);
}

function getSourcePluginDir() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "plugin");
  }
  // Dev: sibling folder in the project root.
  return path.join(__dirname, "..", PLUGIN_NAME);
}

// ── file utilities ────────────────────────────────────────────────────────────

function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function removeDirSync(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ── Stream Deck process management ───────────────────────────────────────────

function isStreamDeckRunning() {
  try {
    if (process.platform === "darwin") {
      // Try both possible process names.
      for (const name of ["Stream Deck", "StreamDeck"]) {
        try {
          execFileSync("pgrep", ["-x", name], { encoding: "utf8", stdio: "pipe" });
          return true;
        } catch {}
      }
      return false;
    }
    if (process.platform === "win32") {
      const result = execFileSync(
        "tasklist",
        ["/FI", "IMAGENAME eq StreamDeck.exe", "/NH"],
        { encoding: "utf8", stdio: "pipe" }
      );
      return result.includes("StreamDeck.exe");
    }
  } catch {}
  return false;
}

function stopStreamDeck() {
  return new Promise((resolve) => {
    if (!isStreamDeckRunning()) return resolve(false);
    if (process.platform === "darwin") {
      execFile("pkill", ["-9", "-f", "Stream Deck"], () => {
        setTimeout(resolve, 1200, true);
      });
    } else {
      execFile("taskkill", ["/F", "/IM", "StreamDeck.exe"], () => {
        setTimeout(resolve, 800, true);
      });
    }
  });
}

function startStreamDeck() {
  if (process.platform === "darwin") {
    // Use bundle ID — more reliable than app name across macOS versions.
    execFile("open", ["-b", "com.elgato.StreamDeck"], (err) => {
      if (err) execFile("open", ["-a", "Stream Deck"]);
    });
  } else if (process.platform === "win32") {
    const candidates = [
      path.join(process.env["PROGRAMFILES"] || "", "Elgato", "StreamDeck", "StreamDeck.exe"),
      path.join(process.env["PROGRAMFILES(X86)"] || "", "Elgato", "StreamDeck", "StreamDeck.exe"),
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        // detached + unref so Stream Deck outlives the installer process
        const child = spawn(p, [], { detached: true, stdio: "ignore" });
        child.unref();
        break;
      }
    }
  }
}

// ── kontroll ─────────────────────────────────────────────────────────────────

function getKontrollBinary() {
  const cpu = os.arch();
  let filename;
  if (process.platform === "darwin") {
    filename = "kontroll-macos";
  } else if (process.platform === "win32") {
    filename = cpu === "x64" ? "kontroll-win-x64.exe" : "kontroll-win-x86.exe";
  } else {
    return null;
  }
  const vendorDir = app.isPackaged
    ? path.join(process.resourcesPath, "plugin", "vendor")
    : path.join(__dirname, "..", PLUGIN_NAME, "vendor");
  const full = path.join(vendorDir, filename);
  return fs.existsSync(full) ? full : null;
}

ipcMain.handle("test-kontroll", async () => {
  const binary = getKontrollBinary();
  if (!binary) {
    return { ok: false, message: "kontroll binary not found in plugin bundle." };
  }
  if (process.platform !== "win32") {
    try { fs.chmodSync(binary, 0o755); } catch {}
  }
  try {
    const { stdout } = await execFileAsync(binary, ["status", "--json"], { timeout: 5000 });
    const data = JSON.parse(stdout.trim());
    const keyboard = data.keyboard?.friendly_name;
    const version = data.keymapp_version;
    const layer = data.keyboard?.current_layer;
    return {
      ok: true,
      message: keyboard
        ? `${keyboard} detected on layer ${layer}`
        : `Keymapp ${version} is running (no keyboard connected)`,
    };
  } catch (err) {
    const msg = err?.message ?? String(err);
    if (err?.killed || msg.includes("ETIMEDOUT") || msg.includes("timed out")) {
      return { ok: false, message: "Keymapp is not responding. Make sure it's running and API is enabled (Keymapp → Settings → Enable API)." };
    }
    return { ok: false, message: "Could not reach Keymapp. Open Keymapp and enable the API under Settings." };
  }
});

// ── IPC ──────────────────────────────────────────────────────────────────────

ipcMain.handle("get-info", () => {
  const pluginsDir = (() => {
    try { return getPluginsDir(); } catch { return "Unknown"; }
  })();
  return {
    platform: process.platform,
    pluginsDir,
    streamDeckRunning: isStreamDeckRunning(),
  };
});

ipcMain.handle("install", async (event, { restartStreamDeck }) => {
  // Push a live step to the renderer as each stage completes.
  const step = (label, ok) => event.sender.send("install-step", { label, ok });

  try {
    const pluginsDir = getPluginsDir();
    const destDir = path.join(pluginsDir, PLUGIN_NAME);
    const sourceDir = getSourcePluginDir();

    if (!fs.existsSync(sourceDir)) {
      throw new Error(`Plugin source not found at: ${sourceDir}`);
    }
    step("Located plugin source files", true);

    if (restartStreamDeck) {
      const wasStopped = await stopStreamDeck();
      if (wasStopped) step("Stopped Stream Deck", true);
    }

    fs.mkdirSync(pluginsDir, { recursive: true });
    step("Verified Stream Deck plugins folder", true);

    removeDirSync(destDir);
    copyDirSync(sourceDir, destDir);
    step("Copied plugin files", true);

    // Ensure vendor binaries are executable on macOS/Linux.
    if (process.platform !== "win32") {
      const vendorDir = path.join(destDir, "vendor");
      if (fs.existsSync(vendorDir)) {
        for (const file of fs.readdirSync(vendorDir)) {
          try { fs.chmodSync(path.join(vendorDir, file), 0o755); } catch {}
        }
        step("Set binary permissions", true);
      }
    }

    if (restartStreamDeck) {
      startStreamDeck();
      step("Restarted Stream Deck", true);
    }

    return { success: true };
  } catch (err) {
    step(`Failed: ${err.message}`, false);
    return { success: false, error: err.message };
  }
});

ipcMain.handle("open-stream-deck", () => startStreamDeck());

// ── window ────────────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 480,
    height: 600,
    resizable: true,
    backgroundColor: "#151515",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(path.join(__dirname, "index.html"));
  win.setMenuBarVisibility(false);

  if (!app.isPackaged) {
    win.webContents.openDevTools({ mode: "detach" });
  }
});

app.on("window-all-closed", () => app.quit());
