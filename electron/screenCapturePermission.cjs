const path = require("node:path");

const SCREEN_CAPTURE_SETTINGS_URL =
  "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture";

function screenCapturePermissionAddonPath({ isPackaged, resourcesPath, baseDirectory = __dirname }) {
  if (isPackaged) {
    return path.join(
      resourcesPath,
      "app.asar.unpacked",
      "dist-native",
      "pinit-screen-permission.node"
    );
  }

  return path.resolve(baseDirectory, "../dist-native/pinit-screen-permission.node");
}

function loadScreenCapturePermission(options) {
  try {
    return require(screenCapturePermissionAddonPath(options));
  } catch {
    return null;
  }
}

async function acquireScreenCapturePermission({
  getStatus,
  nativePermission,
  openSettings,
  requestAlreadyAttempted = false
}) {
  const status = readStatus(getStatus);
  if (readNativePreflight(nativePermission)) {
    return { granted: true, reason: "granted", status };
  }

  if (!nativePermission || typeof nativePermission.request !== "function") {
    return { granted: false, reason: "native-helper-unavailable", status };
  }

  let requested = false;
  try {
    requested = nativePermission.request() === true;
  } catch {
    return { granted: false, reason: "native-helper-unavailable", status };
  }

  if (requested || readNativePreflight(nativePermission)) {
    return { granted: true, reason: "granted", status };
  }

  const settingsOpened =
    requestAlreadyAttempted &&
    ["denied", "restricted"].includes(status) &&
    typeof openSettings === "function";
  if (settingsOpened) {
    await openSettings().catch(() => {});
  }

  return {
    granted: false,
    reason: "permission-required",
    status,
    requestAttempted: true,
    settingsOpened
  };
}

function readStatus(getStatus) {
  try {
    return getStatus();
  } catch {
    return "unknown";
  }
}

function readNativePreflight(nativePermission) {
  try {
    return nativePermission?.preflight?.() === true;
  } catch {
    return false;
  }
}

module.exports = {
  SCREEN_CAPTURE_SETTINGS_URL,
  acquireScreenCapturePermission,
  loadScreenCapturePermission,
  screenCapturePermissionAddonPath
};
