const assert = require("node:assert/strict");
const path = require("node:path");
const {
  SCREEN_CAPTURE_SETTINGS_URL,
  acquireScreenCapturePermission,
  screenCapturePermissionAddonPath
} = require("../electron/screenCapturePermission.cjs");

assert.equal(
  screenCapturePermissionAddonPath({
    isPackaged: true,
    resourcesPath: "/Applications/Pin It.app/Contents/Resources"
  }),
  path.join(
    "/Applications/Pin It.app/Contents/Resources",
    "app.asar.unpacked",
    "dist-native",
    "pinit-screen-permission.node"
  )
);
assert.match(
  screenCapturePermissionAddonPath({ isPackaged: false, resourcesPath: "" }),
  /dist-native\/pinit-screen-permission\.node$/
);
assert.match(SCREEN_CAPTURE_SETTINGS_URL, /Privacy_ScreenCapture$/);

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function run() {
  await grantedElectronStatusDoesNotBypassNativePreflight();
  await nativePreflightSkipsNativeRequest();
  await undeterminedStatusRequestsFromTheApp();
  await firstDeniedRequestLeavesTheSystemPromptAlone();
  await repeatedDeniedRequestOpensSettings();
  await missingNativeHelperStopsCapture();
  console.log("screen capture permission tests passed");
}

async function grantedElectronStatusDoesNotBypassNativePreflight() {
  let requestCount = 0;
  const result = await acquireScreenCapturePermission({
    getStatus: () => "granted",
    nativePermission: {
      preflight: () => false,
      request: () => {
        requestCount += 1;
        return false;
      }
    }
  });

  assert.equal(result.granted, false);
  assert.equal(result.requestAttempted, true);
  assert.equal(requestCount, 1);
}

async function nativePreflightSkipsNativeRequest() {
  let requestCount = 0;
  const result = await acquireScreenCapturePermission({
    getStatus: () => "not-determined",
    nativePermission: {
      preflight: () => true,
      request: () => {
        requestCount += 1;
        return false;
      }
    }
  });

  assert.equal(result.granted, true);
  assert.equal(requestCount, 0);
}

async function undeterminedStatusRequestsFromTheApp() {
  let requestCount = 0;
  let settingsCount = 0;
  const result = await acquireScreenCapturePermission({
    getStatus: () => "not-determined",
    nativePermission: {
      preflight: () => false,
      request: () => {
        requestCount += 1;
        return false;
      }
    },
    openSettings: async () => {
      settingsCount += 1;
    }
  });

  assert.deepEqual(result, {
    granted: false,
    reason: "permission-required",
    status: "not-determined",
    requestAttempted: true,
    settingsOpened: false
  });
  assert.equal(requestCount, 1);
  assert.equal(settingsCount, 0);
}

async function firstDeniedRequestLeavesTheSystemPromptAlone() {
  let requestCount = 0;
  let settingsCount = 0;
  const result = await acquireScreenCapturePermission({
    getStatus: () => "denied",
    nativePermission: {
      preflight: () => false,
      request: () => {
        requestCount += 1;
        return false;
      }
    },
    openSettings: async () => {
      settingsCount += 1;
    }
  });

  assert.equal(result.granted, false);
  assert.equal(result.settingsOpened, false);
  assert.equal(requestCount, 1);
  assert.equal(settingsCount, 0);
}

async function repeatedDeniedRequestOpensSettings() {
  let requestCount = 0;
  let settingsCount = 0;
  const result = await acquireScreenCapturePermission({
    getStatus: () => "denied",
    nativePermission: {
      preflight: () => false,
      request: () => {
        requestCount += 1;
        return false;
      }
    },
    openSettings: async () => {
      settingsCount += 1;
    },
    requestAlreadyAttempted: true
  });

  assert.equal(result.granted, false);
  assert.equal(result.settingsOpened, true);
  assert.equal(requestCount, 1);
  assert.equal(settingsCount, 1);
}

async function missingNativeHelperStopsCapture() {
  const result = await acquireScreenCapturePermission({
    getStatus: () => "not-determined",
    nativePermission: null
  });

  assert.deepEqual(result, {
    granted: false,
    reason: "native-helper-unavailable",
    status: "not-determined"
  });
}
