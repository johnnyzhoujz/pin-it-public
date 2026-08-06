export function isElectronRuntime() {
  return typeof window !== "undefined" && Boolean(window.keepThatElectron);
}

export async function setupNativeBridge({
  onCapture,
  onCaptureEmpty,
  onOnboardingState,
  onSidecarSide,
  onStatus,
  onToggleBuild,
  onUpdateAvailable,
  onWindowBlur
}) {
  if (!isElectronRuntime()) {
    return {
      available: false,
      shortcutLabel: "Command+Shift+I",
      status: "Web preview"
    };
  }

  const api = window.keepThatElectron;
  const nativeInfo = await api.info();
  const unlisteners = [
    api.onCapture((payload) => onCapture?.(payload)),
    api.onCaptureEmpty((payload) => onCaptureEmpty?.(payload)),
    api.onOnboardingState?.((payload) => onOnboardingState?.(payload)),
    api.onSidecarSide?.((payload) => onSidecarSide?.(payload)),
    api.onStatus((payload) => onStatus?.(payload)),
    api.onToggleBuild(() => onToggleBuild?.()),
    api.onUpdateAvailable?.((payload) => onUpdateAvailable?.(payload)),
    api.onWindowBlur?.(() => onWindowBlur?.())
  ].filter(Boolean);

  return {
    available: true,
    shortcutLabel: nativeInfo.shortcutLabel || "Command+Shift+I",
    status: nativeInfo.status || "Electron ready",
    storagePath: nativeInfo.storagePath,
    mcpServerPath: nativeInfo.mcpServerPath,
    mcpServerName: nativeInfo.mcpServerName,
    nodePath: nativeInfo.nodePath,
    sidecarSide: nativeInfo.sidecarSide || "right",
    onboarding: nativeInfo.onboarding || { clipboardLessonComplete: true, screenshotLessonComplete: true },
    ai: nativeInfo.ai,
    dispose: () => {
      unlisteners.forEach((unlisten) => unlisten());
    }
  };
}

export async function showNativeWindow() {
  if (isElectronRuntime()) {
    await window.keepThatElectron.showWindow();
  }
}

export async function hideNativeWindow() {
  if (isElectronRuntime()) {
    await window.keepThatElectron.hideWindow();
  }
}

export async function openNativeUrl(url) {
  if (isElectronRuntime()) {
    return window.keepThatElectron.openUrl(url);
  }

  return false;
}

export async function setNativeWindowMode(mode, options = {}) {
  if (isElectronRuntime()) {
    await window.keepThatElectron.setWindowMode(mode, options);
  }
}

export async function moveNativeWindowBy(delta) {
  if (isElectronRuntime()) {
    await window.keepThatElectron.moveWindowBy(delta);
  }
}

export async function snapNativeWindowToSide() {
  if (!isElectronRuntime()) {
    return "right";
  }

  return window.keepThatElectron.snapWindowToSide();
}

export async function captureNativeClipboard({ copySelectionFirst }) {
  if (!isElectronRuntime()) {
    return false;
  }

  await window.keepThatElectron.captureClipboard({ copySelectionFirst });
  return true;
}

export async function captureNativeScreenshotRegion() {
  if (!isElectronRuntime()) {
    return false;
  }

  return window.keepThatElectron.captureScreenshotRegion();
}

export async function completeNativeOnboardingStep(step) {
  if (!isElectronRuntime()) {
    return { clipboardLessonComplete: true, screenshotLessonComplete: true };
  }

  return window.keepThatElectron.completeOnboardingStep(step);
}

export async function writeNativeClipboard(payload) {
  if (!isElectronRuntime()) {
    return false;
  }

  await window.keepThatElectron.writeClipboard(payload);
  return true;
}

export async function copyNativePinImage(pinId) {
  if (!isElectronRuntime()) {
    return false;
  }

  await window.keepThatElectron.copyPinImage(pinId);
  return true;
}

export async function readNativePinImageDataUrl(pinId) {
  if (!isElectronRuntime()) {
    return "";
  }

  return window.keepThatElectron.readPinImageDataUrl(pinId);
}

export async function writeNativePinImage(payload) {
  if (!isElectronRuntime()) {
    return null;
  }

  return window.keepThatElectron.writePinImage(payload);
}

export async function readNativeStore() {
  if (!isElectronRuntime()) {
    return "";
  }

  return window.keepThatElectron.readStore();
}

export async function writeNativeStore(value) {
  if (isElectronRuntime()) {
    return window.keepThatElectron.writeStore(value);
  }

  return "";
}

export async function completeNativeStorageCutover(value) {
  if (isElectronRuntime()) {
    return window.keepThatElectron.completeStorageCutover(value);
  }

  return value;
}

export async function generateNativePinTitle(payload) {
  if (!isElectronRuntime()) {
    return {
      ok: false,
      code: "native_unavailable",
      message: "Smart titles run in Electron."
    };
  }

  return window.keepThatElectron.generatePinTitle(payload);
}

export async function saveNativeOpenAIApiKey(value) {
  if (!isElectronRuntime()) {
    return {
      configured: false,
      message: "API key storage runs in Electron."
    };
  }

  return window.keepThatElectron.saveOpenAIApiKey(value);
}

export async function refreshNativeOpenAIApiKeyStatus() {
  if (!isElectronRuntime()) {
    return {
      configured: false,
      message: "API key storage runs in Electron."
    };
  }

  return window.keepThatElectron.refreshOpenAIApiKeyStatus();
}

export async function clearNativeOpenAIApiKey() {
  if (!isElectronRuntime()) {
    return {
      configured: false,
      message: "API key storage runs in Electron."
    };
  }

  return window.keepThatElectron.clearOpenAIApiKey();
}
