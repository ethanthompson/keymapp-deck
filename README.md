# Keymapp Deck

A Stream Deck plugin that lets you switch your ZSA keyboard to any layer with a single button press.

## What it does

Each Stream Deck key can be configured to activate a specific layer on your ZSA keyboard (Moonlander, Voyager, ErgoDox EZ, etc.). Press the key, the layer switches instantly. The key label updates to show which layer it's assigned to.

## Requirements

- A ZSA keyboard (Moonlander, Voyager, ErgoDox EZ)
- [Keymapp](https://www.zsa.io/keymapp) installed and running
- Keymapp API enabled: **Keymapp → Settings → Enable API**
- Stream Deck hardware + software (version 6.7 or later)

## Installation

### macOS / Windows installer (recommended)

1. Download the latest `.dmg` (macOS) or `.exe` (Windows) from the [Releases](../../releases) page.
2. **macOS:** Open the DMG, drag **Keymapp Deck** to Applications. On first launch, right-click the app and choose **Open**, then click **Open** in the dialog — macOS blocks unsigned apps by default, this bypasses it once.
3. **Windows:** Run the installer.
4. The installer checks your Keymapp connection, copies the plugin to Stream Deck's plugin folder, and restarts Stream Deck automatically.

### Stream Deck plugin only

Download the `.streamDeckPlugin` file from [Releases](../../releases) and double-click it. Stream Deck will install it directly. You'll need to make sure the `kontroll` binary inside the plugin has execute permission on macOS (the installer handles this automatically).

## How to use

1. Open Stream Deck.
2. Find **Keymapp Deck** in the action list on the right.
3. Drag **Set Layer** onto any key.
4. In the settings panel, set the **Layer** number (0-indexed, matching your Keymapp layout).
5. Press the key — your keyboard switches to that layer.

You can add as many keys as you have layers, giving you a dedicated button for each.

## How it works

The plugin communicates with Keymapp through its local gRPC API using the bundled [`kontroll`](https://github.com/zsa/kontroll) CLI binary. No separate installation of `kontroll` is needed — it's included in the plugin bundle. When you press a Stream Deck key, the plugin runs `kontroll set-layer --index N` in the background.

The Keymapp API must be running for layer switching to work. If Keymapp is closed or the API is disabled, the Stream Deck key will flash an alert instead of switching.

## Gotchas

- **Keymapp must be open** whenever you want to use the plugin. The Stream Deck key will show an alert (⚠) if Keymapp isn't reachable.
- **Enable the API in Keymapp** before use: Keymapp → Settings → Enable API. This is a one-time setup.
- **Layer numbers are 0-indexed.** Layer 1 in Keymapp's UI is layer `0` here, layer 2 is `1`, and so on.
- **macOS first-launch warning** — see Installation above.
- The bundled `kontroll` binary targets macOS (universal) and Windows x64. If you need a different architecture, set a custom CLI path in the action's advanced settings.

## Advanced

In the Stream Deck property inspector for each key, there's an **Advanced** section with a **CLI path** field. Leave it blank to use the bundled binary. Set it to a custom path if you want to use a specific version of `kontroll` you've installed yourself.

## Building from source

```sh
npm install
node scripts/download-kontroll.mjs   # downloads kontroll binaries into the plugin
npm run build                         # compiles TypeScript → plugin.js
npm run installer:dev                 # runs the Electron installer locally
```

To build distributable installers:

```sh
npm run dist:mac   # macOS DMG
npm run dist:win   # Windows EXE
```
