import streamDeck, {
  action,
  KeyDownEvent,
  SendToPluginEvent,
  SingletonAction,
  WillAppearEvent,
} from "@elgato/streamdeck";
import type { JsonValue } from "@elgato/utils";
import { execFile } from "child_process";
import { promisify } from "util";
import { existsSync, chmodSync } from "fs";
import { homedir, platform, arch } from "os";
import path from "path";

const execFileAsync = promisify(execFile);

// Any kontroll call that takes longer than this means Keymapp isn't reachable.
const KONTROLL_TIMEOUT_MS = 6000;

type Settings = {
  layer: number;
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

async function setLayer(binary: string, layer: number): Promise<void> {
  const args = ["set-layer", "--index", String(layer)];
  try {
    // Try directly — works when Keymapp already has a keyboard active (the common case).
    await execFileAsync(binary, args, { timeout: KONTROLL_TIMEOUT_MS });
  } catch (directErr) {
    const msg = directErr instanceof Error ? directErr.message : String(directErr);
    // If the error is "not connected" / no keyboard selected, try connecting first.
    const needsConnect =
      msg.includes("not connected") ||
      msg.includes("No keyboard") ||
      msg.includes("no keyboard");
    if (!needsConnect) throw directErr; // Some other error — surface it.

    // connect-any exits 1 if a keyboard is already connected, so ignore that exit code.
    try {
      await execFileAsync(binary, ["connect-any"], { timeout: KONTROLL_TIMEOUT_MS });
    } catch {
      // "keyboard already connected" exits 1 — that's fine, proceed anyway.
    }
    // Retry set-layer after connecting.
    await execFileAsync(binary, args, { timeout: KONTROLL_TIMEOUT_MS });
  }
}

@action({ UUID: "com.ethanthompson.keymapp-layers.set-layer" })
export class SetLayerAction extends SingletonAction<Settings> {
  override async onWillAppear(ev: WillAppearEvent<Settings>): Promise<void> {
    const { layer = 0 } = ev.payload.settings;
    if (ev.action.isKey()) {
      await ev.action.setTitle(`Layer ${layer}`);
    }
  }

  override async onKeyDown(ev: KeyDownEvent<Settings>): Promise<void> {
    const { layer = 0, kontrollPath } = ev.payload.settings;
    const binary = resolveKontroll(kontrollPath);

    if (!binary) {
      streamDeck.logger.error("kontroll binary not found.");
      await ev.action.showAlert();
      return;
    }

    try {
      await setLayer(binary, layer);
      if (ev.action.isKey()) await ev.action.showOk();
    } catch (err) {
      streamDeck.logger.error(`Layer ${layer} failed: ${friendlyError(err)}`);
      await ev.action.showAlert();
    }
  }

  override async onSendToPlugin(ev: SendToPluginEvent<JsonValue, Settings>): Promise<void> {
    const payload = ev.payload as {
      event?: string;
      layer?: number;
      kontrollPath?: string;
    };

    if (payload.event === "settingsUpdated") {
      const { layer = 0, kontrollPath } = payload;
      await ev.action.setSettings({ layer, kontrollPath });
      if (ev.action.isKey()) {
        await ev.action.setTitle(`Layer ${layer}`);
      }
    }

    if (payload.event === "testConnection") {
      await this.runConnectionTest(ev.payload as { kontrollPath?: string });
    }
  }

  private async runConnectionTest(payload: { kontrollPath?: string }): Promise<void> {
    const binary = resolveKontroll(payload.kontrollPath);

    if (!binary) {
      await streamDeck.ui.sendToPropertyInspector({
        event: "testResult",
        ok: false,
        message: "kontroll binary not found. Try reinstalling the plugin.",
      });
      return;
    }

    try {
      // `status` is a lightweight call that only needs Keymapp running — no keyboard required.
      const { stdout } = await execFileAsync(binary, ["status", "--json"], {
        timeout: KONTROLL_TIMEOUT_MS,
      });
      const parsed = JSON.parse(stdout || "{}");
      const version = parsed.keymapp_version ?? parsed.version ?? "unknown";
      await streamDeck.ui.sendToPropertyInspector({
        event: "testResult",
        ok: true,
        message: `Connected to Keymapp ${version}.`,
      });
    } catch (err) {
      await streamDeck.ui.sendToPropertyInspector({
        event: "testResult",
        ok: false,
        message: friendlyError(err),
      });
    }
  }
}
