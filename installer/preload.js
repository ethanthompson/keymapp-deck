"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("installer", {
  getInfo: () => ipcRenderer.invoke("get-info"),
  testKontroll: () => ipcRenderer.invoke("test-kontroll"),
  install: (opts) => ipcRenderer.invoke("install", opts),
  openStreamDeck: () => ipcRenderer.invoke("open-stream-deck"),
  onStep: (callback) => {
    // Explicit void return — contextBridge requires serializable return values,
    // and ipcRenderer.on() returns an IpcRenderer object that isn't serializable.
    ipcRenderer.on("install-step", (_event, step) => callback(step));
  },
});
