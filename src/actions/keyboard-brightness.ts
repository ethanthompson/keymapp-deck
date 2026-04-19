import streamDeck, {
  action,
  KeyDownEvent,
  SendToPluginEvent,
  SingletonAction,
} from "@elgato/streamdeck";
import type { JsonValue } from "@elgato/utils";
import { execFile } from "child_process";
import { promisify } from "util";
import { existsSync, chmodSync } from "fs";
import { homedir, platform, arch } from "os";
import path from "path";

const execFileAsync = promisify(execFile);

const KONTROLL_TIMEOUT_MS = 6000;

type Settings = {
  kontrollPath?: string;
};

function getBundledBinary(): string | null {
  const os = platform();
  const cpu = arch();

  let filename: string;
  if (os === "darwin") {
    filename = "kontroll-macos";
  } else if (os === "win32") {
    filename = cpu === "x64" ? "kontroll-win-x64.exe" : "kontroll-win-x86.exe";
  } else {
    return null;
  }

  const vendorPath = path.join(__dirname, "..", "vendor", filename);
  if (!existsSync(vendorPath)) return null;

  if (os !== "win32") {
    try { chmodSync(vendorPath, 0o755); } catch { /* best-effort */ }
  }

  return vendorPath;
}

const SYSTEM_KONTROLL_PATHS = [
  "/opt/homebrew/bin/kontroll",
  "/usr/local/bin/kontroll",
  `${homedir()}/.cargo/bin/kontroll`,
];

function resolveKontroll(customPath?: string): string | null {
  if (customPath?.trim() && existsSync(customPath.trim())) return customPath.trim();
  const bundled = getBundledBinary();
  if (bundled) return bundled;
  for (const p of SYSTEM_KONTROLL_PATHS) {
    if (existsSync(p)) return p;
  }
  return null;
}

function friendlyError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("ETIMEDOUT") || msg.includes("timed out") || msg.includes("killed")) {
    return "Timed out. Is Keymapp running with API enabled? (Keymapp → Settings → Enable API)";
  }
  if (msg.includes("ENOENT") || msg.includes("No such file")) {
    return "kontroll binary not found. Try reinstalling the plugin.";
  }
  if (msg.includes("ECONNREFUSED") || msg.includes("connection refused")) {
    return "Connection refused. Enable the API in Keymapp → Settings.";
  }
  return msg;
}

async function runBrightnessCommand(binary: string, command: "increase-brightness" | "decrease-brightness"): Promise<void> {
  try {
    await execFileAsync(binary, [command], { timeout: KONTROLL_TIMEOUT_MS });
  } catch (directErr) {
    const msg = directErr instanceof Error ? directErr.message : String(directErr);
    const needsConnect =
      msg.includes("not connected") ||
      msg.includes("No keyboard") ||
      msg.includes("no keyboard");
    if (!needsConnect) throw directErr;

    try {
      await execFileAsync(binary, ["connect-any"], { timeout: KONTROLL_TIMEOUT_MS });
    } catch {
      // "keyboard already connected" exits 1 — that's fine, proceed anyway.
    }
    await execFileAsync(binary, [command], { timeout: KONTROLL_TIMEOUT_MS });
  }
}

@action({ UUID: "com.ethanthompson.keymapp-layers.increase-brightness" })
export class IncreaseBrightnessAction extends SingletonAction<Settings> {
  override async onKeyDown(ev: KeyDownEvent<Settings>): Promise<void> {
    const { kontrollPath } = ev.payload.settings;
    const binary = resolveKontroll(kontrollPath);

    if (!binary) {
      streamDeck.logger.error("kontroll binary not found.");
      await ev.action.showAlert();
      return;
    }

    try {
      await runBrightnessCommand(binary, "increase-brightness");
      if (ev.action.isKey()) await ev.action.showOk();
    } catch (err) {
      streamDeck.logger.error(`Increase brightness failed: ${friendlyError(err)}`);
      await ev.action.showAlert();
    }
  }

  override async onSendToPlugin(ev: SendToPluginEvent<JsonValue, Settings>): Promise<void> {
    const payload = ev.payload as { event?: string; kontrollPath?: string };
    if (payload.event === "settingsUpdated") {
      await ev.action.setSettings({ kontrollPath: payload.kontrollPath });
    }
  }
}

@action({ UUID: "com.ethanthompson.keymapp-layers.decrease-brightness" })
export class DecreaseBrightnessAction extends SingletonAction<Settings> {
  override async onKeyDown(ev: KeyDownEvent<Settings>): Promise<void> {
    const { kontrollPath } = ev.payload.settings;
    const binary = resolveKontroll(kontrollPath);

    if (!binary) {
      streamDeck.logger.error("kontroll binary not found.");
      await ev.action.showAlert();
      return;
    }

    try {
      await runBrightnessCommand(binary, "decrease-brightness");
      if (ev.action.isKey()) await ev.action.showOk();
    } catch (err) {
      streamDeck.logger.error(`Decrease brightness failed: ${friendlyError(err)}`);
      await ev.action.showAlert();
    }
  }

  override async onSendToPlugin(ev: SendToPluginEvent<JsonValue, Settings>): Promise<void> {
    const payload = ev.payload as { event?: string; kontrollPath?: string };
    if (payload.event === "settingsUpdated") {
      await ev.action.setSettings({ kontrollPath: payload.kontrollPath });
    }
  }
}
