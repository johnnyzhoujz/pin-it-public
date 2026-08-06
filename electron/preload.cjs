const { contextBridge, ipcRenderer } = require("electron");

const listeners = new Set();

function on(channel, callback) {
  const handler = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, handler);
  const unsubscribe = () => ipcRenderer.removeListener(channel, handler);
  listeners.add(unsubscribe);
  return unsubscribe;
}

contextBridge.exposeInMainWorld("keepThatElectron", {
  captureClipboard: (options) => ipcRenderer.invoke("native:capture-clipboard", options),
  captureScreenshotRegion: () => ipcRenderer.invoke("native:capture-screenshot-region"),
  completeOnboardingStep: (step) => ipcRenderer.invoke("native:complete-onboarding-step", step),
  copyPinImage: (pinId) => ipcRenderer.invoke("native:copy-pin-image", pinId),
  completeStorageCutover: (value) => ipcRenderer.invoke("native:complete-storage-cutover", value),
  clearOpenAIApiKey: () => ipcRenderer.invoke("native:clear-openai-api-key"),
  generatePinTitle: (payload) => ipcRenderer.invoke("native:generate-pin-title", payload),
  hideWindow: () => ipcRenderer.invoke("native:hide-window"),
  info: () => ipcRenderer.invoke("native:info"),
  moveWindowBy: (delta) => ipcRenderer.invoke("native:move-window-by", delta),
  openUrl: (url) => ipcRenderer.invoke("native:open-url", url),
  readPinImageDataUrl: (pinId) => ipcRenderer.invoke("native:read-pin-image-data-url", pinId),
  refreshOpenAIApiKeyStatus: () => ipcRenderer.invoke("native:refresh-openai-api-key-status"),
  readStore: () => ipcRenderer.invoke("native:read-store"),
  quit: () => ipcRenderer.invoke("native:quit"),
  reloadWindow: () => ipcRenderer.invoke("native:reload-window"),
  saveOpenAIApiKey: (value) => ipcRenderer.invoke("native:save-openai-api-key", value),
  setWindowMode: (mode, options) => ipcRenderer.invoke("native:set-window-mode", mode, options),
  showWindow: () => ipcRenderer.invoke("native:show-window"),
  snapWindowToSide: () => ipcRenderer.invoke("native:snap-window-to-side"),
  writeClipboard: (payload) => ipcRenderer.invoke("native:write-clipboard", payload),
  writePinImage: (payload) => ipcRenderer.invoke("native:write-pin-image", payload),
  writeStore: (value) => ipcRenderer.invoke("native:write-store", value),
  onCapture: (callback) => on("native:capture", callback),
  onCaptureEmpty: (callback) => on("native:capture-empty", callback),
  onOnboardingState: (callback) => on("native:onboarding-state", callback),
  onSidecarSide: (callback) => on("native:sidecar-side", callback),
  onStatus: (callback) => on("native:status", callback),
  onToggleBuild: (callback) => on("native:toggle-build", callback),
  onUpdateAvailable: (callback) => on("native:update-available", callback),
  onWindowBlur: (callback) => on("native:window-blur", callback),
  removeAllListeners: () => {
    listeners.forEach((unsubscribe) => unsubscribe());
    listeners.clear();
  }
});
