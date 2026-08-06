const { app, BrowserWindow, clipboard, globalShortcut, ipcMain, Menu, nativeImage, net, protocol, screen, shell, systemPreferences, Tray } = require("electron");
const { autoUpdater } = require("electron-updater");
const { execFile } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const fsSync = require("node:fs");
const fs = require("node:fs/promises");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { resolveAppChannel } = require("./appChannel.cjs");
const { clearOpenAIKey, isCredentialAccessError, readOpenAIKey, saveOpenAIKey } = require("./credentialStore.cjs");
const { configureMcpClients } = require("./mcpConfig.cjs");
const {
  ONBOARDING_FLOW_VERSION,
  freshOnboardingState,
  normalizeOnboardingState
} = require("./onboardingState.cjs");
const {
  ONBOARDING_WINDOW_LEVEL,
  onboardingWindowOptions,
  shouldCopySelectionBeforeCapture
} = require("./onboardingWindow.cjs");
const { screenshotCaptureArgs } = require("./screenshotCapture.cjs");
const {
  SCREEN_CAPTURE_SETTINGS_URL,
  acquireScreenCapturePermission,
  loadScreenCapturePermission
} = require("./screenCapturePermission.cjs");
const { generatePinTitle, openAIStatus } = require("./openaiHarness.cjs");
const { isExternalHttpUrl, isTrustedRendererUrl } = require("./securityPolicy.cjs");
const {
  autoUpdateChannel,
  checkManualUpdate,
  hasDeveloperIdSignatureOutput,
  isAutoUpdaterEligible
} = require("./update.cjs");

const isDev = !app.isPackaged && process.env.KEEP_THAT_LOAD_DIST !== "1";
const appChannel = resolveAppChannel({ isPackaged: app.isPackaged, packagedName: app.getName() });
const productName = appChannel.productName;
const userDataPath = path.join(app.getPath("appData"), appChannel.userDataDirectory);
const devUrl = process.env.VITE_DEV_SERVER_URL || "http://127.0.0.1:5173";
const hotkey = process.platform === "darwin" ? appChannel.clipboardHotkeyMac : "Control+Shift+I";
const screenshotHotkey = process.platform === "darwin" ? appChannel.screenshotHotkeyMac : "";
const onboardingSampleText = `${productName} saves the useful thing I am looking at right now.`;
const isMcpSetupSelftest = process.argv.includes("--mcp-setup-selftest");
const nativeScreenCapturePermission =
  process.platform === "darwin"
    ? loadScreenCapturePermission({
        isPackaged: app.isPackaged,
        resourcesPath: process.resourcesPath
      })
    : null;
const storeFilesPromise = import("../src/store/files.js");
const writeQueuePromise = import("../src/store/writeQueue.js");
const windowModes = {
  dock: { width: 74, height: 150, resizable: false },
  capture: { width: 444, height: 360, resizable: false },
  build: { width: 920, height: 650, resizable: true },
  recovery: { width: 420, height: 620, resizable: true }
};

let mainWindow = null;
let onboardingWindows = [];
let tray = null;
let currentWindowMode = "dock";
let hasAppliedInitialBounds = false;
let sidecarSide = "right";
let enqueueStoreWrite = null;
let mcpSetupState = { configured: [], failed: [], results: [] };
let startupStorageRecovery = null;
let screenCapturePermissionRequestAttempted = false;
let onboardingState = {
  flowVersion: ONBOARDING_FLOW_VERSION,
  clipboardLessonComplete: true,
  screenshotLessonComplete: true
};

protocol.registerSchemesAsPrivileged([
  {
    scheme: "pinit",
    privileges: { standard: true, secure: true, stream: true }
  }
]);

fsSync.mkdirSync(userDataPath, { recursive: true });
app.setPath("userData", userDataPath);
app.setName(productName);
if (appChannel.id === "development" && !process.env.PINIT_STORE_PATH?.trim()) {
  process.env.PINIT_STORE_PATH = path.join(userDataPath, "keeps.json");
}

const hasSingleInstanceLock = isMcpSetupSelftest || app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
}

function createWindow({ storageRecovery = startupStorageRecovery } = {}) {
  mainWindow = new BrowserWindow({
    width: windowModes.dock.width,
    height: windowModes.dock.height,
    minWidth: windowModes.dock.width,
    minHeight: windowModes.dock.height,
    frame: false,
    hasShadow: false,
    transparent: true,
    backgroundColor: "#00000000",
    show: true,
    movable: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    title: productName,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.cjs")
    }
  });

  mainWindow.setAlwaysOnTop(true, "floating");
  mainWindow.setHasShadow(false);
  applyWindowMode("dock", { show: false });
  installWindowRecoveryHandlers(mainWindow);
  installWindowSecurityHandlers(mainWindow);

  if (storageRecovery) {
    loadStorageRecoveryPage(storageRecovery);
  } else {
    loadAppRenderer();
  }

  if (isDev && process.env.KEEP_THAT_OPEN_DEVTOOLS === "1") {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }

  mainWindow.on("close", (event) => {
    if (!app.isQuitting && !isDev) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on("blur", () => {
    if (currentWindowMode !== "dock") {
      sendToRenderer("native:window-blur", { windowMode: currentWindowMode });
    }
  });
}

function rendererFileUrl() {
  return pathToFileURL(path.join(__dirname, "../dist/index.html")).toString();
}

function trustedRendererUrl(value, { allowRecovery = false } = {}) {
  return isTrustedRendererUrl(value, {
    allowRecovery,
    devUrl: isDev ? devUrl : "",
    productionUrl: isDev ? "" : rendererFileUrl()
  });
}

function installWindowSecurityHandlers(window) {
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternalHttpUrl(url)) {
      shell.openExternal(url).catch(() => {});
    }
    return { action: "deny" };
  });

  window.webContents.on("will-navigate", (event, url) => {
    if (trustedRendererUrl(url)) {
      return;
    }

    event.preventDefault();
    if (isExternalHttpUrl(url)) {
      shell.openExternal(url).catch(() => {});
    }
  });
}

function isTrustedMainWindowIpc(event, { allowRecovery = false } = {}) {
  if (!mainWindow || mainWindow.isDestroyed() || event.sender.id !== mainWindow.webContents.id) {
    return false;
  }

  return trustedRendererUrl(event.senderFrame?.url || event.sender.getURL(), { allowRecovery });
}

function handleTrustedIpc(channel, handler, options = {}) {
  ipcMain.handle(channel, (event, ...args) => {
    if (!isTrustedMainWindowIpc(event, options)) {
      throw new Error(`Blocked untrusted IPC request: ${channel}`);
    }
    return handler(event, ...args);
  });
}

function isTrustedOnboardingIpc(event) {
  return onboardingWindows.some(
    (window) => !window.isDestroyed() && window.webContents.id === event.sender.id && event.senderFrame?.url?.startsWith("data:text/html")
  );
}

function onboardingStatePath() {
  return path.join(app.getPath("userData"), "onboarding.json");
}

async function initializeOnboardingState() {
  try {
    const stored = await fs.readFile(onboardingStatePath(), "utf8");
    const parsed = JSON.parse(stored);
    onboardingState = normalizeOnboardingState(parsed);
    if (parsed?.flowVersion !== ONBOARDING_FLOW_VERSION) {
      await writeOnboardingState();
    }
    return onboardingState;
  } catch (error) {
    if (error.code !== "ENOENT") {
      onboardingState = freshOnboardingState();
      await writeOnboardingState();
      return onboardingState;
    }
  }

  onboardingState = freshOnboardingState();
  await writeOnboardingState();
  return onboardingState;
}

async function writeOnboardingState() {
  await fs.mkdir(path.dirname(onboardingStatePath()), { recursive: true });
  await fs.writeFile(onboardingStatePath(), `${JSON.stringify(onboardingState, null, 2)}\n`, "utf8");
}

async function completeOnboardingStep(step) {
  if (step === "clipboard") {
    onboardingState = { ...onboardingState, clipboardLessonComplete: true };
  }
  if (step === "screenshot") {
    onboardingState = { ...onboardingState, screenshotLessonComplete: true };
  }

  await writeOnboardingState();
  syncOnboardingWindows();
  sendToRenderer("native:onboarding-state", onboardingState);
  return onboardingState;
}

function syncOnboardingWindows() {
  if (onboardingState.clipboardLessonComplete || process.platform !== "darwin") {
    destroyOnboardingWindows();
    return;
  }

  destroyOnboardingWindows();
  onboardingWindows = [createOnboardingWindow(screen.getPrimaryDisplay())];
}

function createOnboardingWindow(display) {
  const window = new BrowserWindow(onboardingWindowOptions({
    display,
    preload: path.join(__dirname, "onboardingPreload.cjs"),
    title: `${productName} onboarding`,
  }));

  window.setAlwaysOnTop(true, ONBOARDING_WINDOW_LEVEL);
  window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(onboardingWindowHtml())}`);
  window.once("ready-to-show", () => {
    if (!onboardingState.clipboardLessonComplete && !window.isDestroyed()) {
      window.showInactive();
    }
  });
  window.on("closed", () => {
    onboardingWindows = onboardingWindows.filter((item) => item !== window);
  });
  return window;
}

function destroyOnboardingWindows() {
  const windows = onboardingWindows;
  onboardingWindows = [];
  windows.forEach((window) => {
    if (!window.isDestroyed()) {
      window.destroy();
    }
  });
}

function onboardingWindowHtml() {
  const captureShortcutText = "Shift Command I";
  const captureShortcutKeys = "<kbd>Shift</kbd><kbd>Command</kbd><kbd>I</kbd>";
  const visibleCard = `<section class="card" aria-label="Welcome to ${productName}">
        <p class="kicker">${productName}</p>
        <h1>Welcome to ${productName}</h1>
        <p class="lede">Copy this sample, then press ${captureShortcutText} to place it on your pin board.</p>
        <button class="copy-button" type="button" data-copy-sample>Copy sample text</button>
        <div class="keys" aria-label="${hotkey}">
          ${captureShortcutKeys}
        </div>
        <p class="hint" data-copy-status>After the pin appears, this screen closes and the board opens.</p>
      </section>`;

  return `<!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${productName}</title>
        <style>
          :root {
            color-scheme: light dark;
            font-family: "Geist", "Avenir Next", -apple-system, BlinkMacSystemFont, sans-serif;
            --card-bg: #fffdf8;
            --card-shadow: 0 1rem 2.8rem rgba(23, 27, 31, 0.14);
            --text: #151b1a;
            --muted: rgba(64, 73, 70, 0.74);
            --soft: rgba(64, 73, 70, 0.62);
            --button-bg: #18201f;
            --button-text: #f8faf5;
            --button-hover: #24312d;
            --key-bg: rgba(23, 27, 31, 0.065);
            --key-border: rgba(23, 27, 31, 0.13);
          }
          @media (prefers-color-scheme: dark) {
            :root {
              --card-bg: #171b24;
              --card-shadow: 0 1rem 2.8rem rgba(0, 0, 0, 0.24);
              --text: #f3f6ff;
              --muted: rgba(243, 246, 255, 0.84);
              --soft: rgba(207, 215, 230, 0.72);
              --button-bg: #f3f6ff;
              --button-text: #10141f;
              --button-hover: #ffffff;
              --key-bg: rgba(255, 255, 255, 0.1);
              --key-border: rgba(255, 255, 255, 0.2);
            }
          }
          * { box-sizing: border-box; }
          html, body { width: 100%; height: 100%; }
          body {
            margin: 0;
            display: grid;
            place-items: center;
            background: transparent;
            color: var(--text);
            overflow: hidden;
            -webkit-font-smoothing: antialiased;
          }
          .card {
            width: min(44rem, calc(100vw - 7rem));
            padding: 2.2rem;
            border: 0;
            border-radius: 1.35rem;
            background: var(--card-bg);
            box-shadow: var(--card-shadow);
            -webkit-app-region: drag;
          }
          .kicker {
            margin: 0 0 0.72rem;
            color: var(--soft);
            font-size: 0.72rem;
            font-weight: 700;
            letter-spacing: 0.02em;
          }
          h1 {
            margin: 0;
            font-size: clamp(2.8rem, 5.6vw, 5.1rem);
            line-height: 0.95;
            letter-spacing: 0;
            max-width: 11ch;
          }
          .lede {
            max-width: 28rem;
            margin: 1.05rem 0 0;
            color: var(--muted);
            font-size: clamp(1rem, 1.6vw, 1.22rem);
            line-height: 1.35;
          }
          .keys {
            display: flex;
            flex-wrap: wrap;
            gap: 0.5rem;
            margin-top: 1.28rem;
          }
          .copy-button {
            min-height: 2.62rem;
            margin-top: 1.18rem;
            padding: 0 1rem;
            border: 1px solid var(--button-bg);
            border-radius: 0.7rem;
            background: var(--button-bg);
            color: var(--button-text);
            font: inherit;
            font-size: 0.88rem;
            font-weight: 780;
            cursor: pointer;
            box-shadow: 0 0.85rem 1.8rem rgba(0, 0, 0, 0.26);
            -webkit-app-region: no-drag;
          }
          .copy-button:hover {
            background: var(--button-hover);
          }
          .copy-button:focus-visible {
            outline: 2px solid rgba(147, 167, 255, 0.92);
            outline-offset: 3px;
          }
          kbd {
            min-height: 2.25rem;
            display: inline-grid;
            place-items: center;
            padding: 0 0.78rem;
            border: 1px solid var(--key-border);
            border-radius: 0.56rem;
            background: var(--key-bg);
            color: var(--text);
            font-size: 0.86rem;
            font-weight: 760;
            box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.16);
          }
          .hint {
            margin: 1.22rem 0 0;
            max-width: 30rem;
            color: var(--soft);
            font-size: 0.84rem;
            line-height: 1.45;
          }
          @media (prefers-reduced-motion: no-preference) {
            .card { animation: cardIn 420ms cubic-bezier(0.16, 1, 0.3, 1) both; }
            @keyframes cardIn {
              from { opacity: 0; transform: translate3d(0, 0.8rem, 0) scale(0.985); }
              to { opacity: 1; transform: translate3d(0, 0, 0) scale(1); }
            }
          }
        </style>
      </head>
      <body>${visibleCard}
        <script>
          const copyButton = document.querySelector("[data-copy-sample]");
          const copyStatus = document.querySelector("[data-copy-status]");
          copyButton?.addEventListener("click", async () => {
            copyButton.disabled = true;
            try {
              await window.pinItOnboarding.copySample();
              copyButton.textContent = "Copied";
              if (copyStatus) {
                copyStatus.textContent = "Now press ${captureShortcutText}. This window will close when the pin reaches the board.";
              }
            } catch {
              copyButton.textContent = "Try again";
              copyButton.disabled = false;
              if (copyStatus) {
                copyStatus.textContent = "Copy did not finish. Click the button again, then press ${captureShortcutText}.";
              }
            }
          });
        </script>
      </body>
    </html>`;
}

function installWindowRecoveryHandlers(window) {
  window.webContents.on("before-input-event", (event, input) => {
    const key = input.key?.toLowerCase();
    const commandOrControl = process.platform === "darwin" ? input.meta : input.control;

    if (input.type !== "keyDown") {
      return;
    }

    if (commandOrControl && key === "w") {
      event.preventDefault();
      window.hide();
    }

    if (commandOrControl && key === "q") {
      event.preventDefault();
      quitApp();
    }

    if (commandOrControl && key === "r") {
      event.preventDefault();
      reloadAppWindow();
    }

    if (commandOrControl && key === "v") {
      event.preventDefault();
      if (input.shift && typeof window.webContents.pasteAndMatchStyle === "function") {
        window.webContents.pasteAndMatchStyle();
        return;
      }
      window.webContents.paste();
    }
  });

  window.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame || validatedURL.startsWith("data:")) {
      return;
    }

    loadRecoveryPage(errorCode, errorDescription);
  });
}

function loadRecoveryPage(errorCode, errorDescription, options = {}) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  applyWindowMode("recovery");
  const heading = options.heading || `${productName} did not load`;
  const body = options.body || "The desktop shell is running, but the local renderer is not available.";
  const detail = options.detail || errorDescription || `Load failed (${errorCode})`;

  const html = `<!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${productName}</title>
        <style>
          :root { color-scheme: light; font-family: -apple-system, BlinkMacSystemFont, "Avenir Next", sans-serif; }
          * { box-sizing: border-box; }
          body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #fff9ee; color: #17191d; }
          .drag { position: fixed; inset: 0 0 auto; height: 36px; -webkit-app-region: drag; }
          main { width: min(320px, calc(100vw - 48px)); display: grid; gap: 14px; }
          h1 { margin: 0; font-size: 20px; letter-spacing: 0; }
          p { margin: 0; color: #6a6258; line-height: 1.45; }
          code { display: block; padding: 10px; border: 1px solid rgba(23,25,29,.14); border-radius: 8px; background: #fffdfa; color: #34373c; white-space: pre-wrap; }
          .actions { display: flex; gap: 8px; flex-wrap: wrap; }
          button { min-height: 34px; padding: 0 12px; border: 1px solid rgba(23,25,29,.16); border-radius: 8px; background: #17191d; color: #fff9ee; font: inherit; font-weight: 700; cursor: pointer; -webkit-app-region: no-drag; }
          button.secondary { background: #fffdfa; color: #17191d; }
        </style>
      </head>
      <body>
        <div class="drag"></div>
        <main>
          <h1>${escapeHtml(heading)}</h1>
          <p>${escapeHtml(body)}</p>
          <code>${escapeHtml(detail)}</code>
          <div class="actions">
            <button id="reload">Reload</button>
            <button id="hide" class="secondary">Hide</button>
            <button id="quit" class="secondary">Quit</button>
          </div>
        </main>
        <script>
          document.getElementById("reload").addEventListener("click", () => window.keepThatElectron.reloadWindow());
          document.getElementById("hide").addEventListener("click", () => window.keepThatElectron.hideWindow());
          document.getElementById("quit").addEventListener("click", () => window.keepThatElectron.quit());
        </script>
      </body>
    </html>`;

  mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
}

function loadStorageRecoveryPage(recovery) {
  loadRecoveryPage(null, null, {
    heading: "Pin data needs attention",
    body: "Pin It left keeps.json untouched and paused normal startup so the file cannot be overwritten. Repair or restore the JSON, then choose Reload.",
    detail: `${recovery.errorName}: ${recovery.errorMessage}\n${recovery.storePath}`
  });
}

function createTray() {
  tray = new Tray(createTrayIcon());
  tray.setToolTip(productName);
  tray.setContextMenu(createTrayMenu());
  tray.on("click", () => showWindow());
}

function createTrayMenu() {
  return Menu.buildFromTemplate([
    { label: "Capture Clipboard", click: () => captureClipboard() },
    ...(process.platform === "darwin" ? [{ label: "Capture Region", click: () => captureScreenshotRegion() }] : []),
    {
      label: "Open Board",
      click: () => {
        applyWindowMode("build");
        sendToRenderer("native:toggle-build");
      }
    },
    { type: "separator" },
    { label: `Show ${productName}`, click: () => showWindow() },
    { label: `Hide ${productName}`, click: () => mainWindow?.hide() },
    { type: "separator" },
    {
      label: "Quit",
      click: () => quitApp()
    }
  ]);
}

function createApplicationMenu() {
  const template = [
    ...(process.platform === "darwin"
      ? [
          {
            label: productName,
            submenu: [
              { label: `Show ${productName}`, click: () => showWindow() },
              { label: `Hide ${productName}`, accelerator: "Command+W", click: () => mainWindow?.hide() },
              { type: "separator" },
              { label: `Quit ${productName}`, accelerator: "Command+Q", click: () => quitApp() }
            ]
          }
        ]
      : []),
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "pasteAndMatchStyle" },
        { role: "delete" },
        { type: "separator" },
        { role: "selectAll" }
      ]
    },
    {
      label: "Window",
      submenu: [
        { label: "Show", click: () => showWindow() },
        { label: "Hide", accelerator: process.platform === "darwin" ? "Command+W" : "Control+W", click: () => mainWindow?.hide() },
        { label: "Reload", accelerator: process.platform === "darwin" ? "Command+R" : "Control+R", click: () => reloadAppWindow() }
      ]
    }
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createTrayIcon() {
  const source = nativeImage.createFromPath(path.join(__dirname, "tray-pin-template.png"));
  const icon = source.resize({ height: 18, quality: "best", width: 18 });
  if (process.platform === "darwin") {
    icon.setTemplateImage(true);
  }
  return icon;
}

function bundledMcpServerPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "app.asar.unpacked", "dist-mcp", "pinit-mcp.mjs");
  }

  return path.resolve(__dirname, "../dist-mcp/pinit-mcp.mjs");
}

async function configureBundledMcpClients() {
  if (!app.isPackaged || process.env.PINIT_SKIP_MCP_SETUP === "1") {
    return { configured: [], failed: [], results: [], skipped: true };
  }

  const homeDir = process.env.PINIT_MCP_CONFIG_HOME || app.getPath("home");
  try {
    return await configureMcpClients({
      commandPath: process.execPath,
      homeDir,
      serverName: appChannel.mcpServerName,
      serverPath: bundledMcpServerPath(),
      storePath: await dataFilePath()
    });
  } catch (error) {
    console.warn(`Automatic MCP setup could not start: ${error?.message || error}`);
    return {
      configured: [],
      failed: ["all"],
      results: [],
      errorMessage: error?.message || String(error)
    };
  }
}

function registerHotkey() {
  globalShortcut.unregisterAll();
  const registered = globalShortcut.register(hotkey, () =>
    runCaptureTask(captureClipboard({ copySelectionFirst: shouldCopySelectionBeforeCapture(onboardingState) }))
  );

  if (!registered) {
    sendToRenderer("native:status", {
      available: false,
      message: `${hotkey} is already in use`
    });
  }

  if (screenshotHotkey) {
    const screenshotRegistered = globalShortcut.register(screenshotHotkey, () => runCaptureTask(captureScreenshotRegion()));
    if (!screenshotRegistered) {
      sendToRenderer("native:status", {
        available: false,
        message: `${screenshotHotkey} is already in use`
      });
    }
  }
}

function runCaptureTask(task) {
  Promise.resolve(task).catch(() => {
    sendToRenderer("native:status", { available: true, message: "Couldn't save capture." });
  });
}

async function captureClipboard({ copySelectionFirst = false } = {}) {
  const sourceWindowMode = currentWindowMode;
  let clipboardSnapshot = null;

  if (copySelectionFirst) {
    const previousSignature = clipboardSnapshotSignature(readClipboardSnapshot());
    await copyCurrentSelection();
    clipboardSnapshot = await waitForClipboardRefresh(previousSignature);
  }

  clipboardSnapshot ||= readClipboardSnapshot();
  const payload = clipboardSnapshot.payload;
  if (payload?.content?.trim()) {
    sendToRenderer("native:capture", {
      ...payload,
      windowMode: sourceWindowMode,
      source: copySelectionFirst ? "selection" : "clipboard"
    });
    return;
  }

  if (sourceWindowMode !== "build") {
    applyWindowMode("capture", { activate: false });
  }
  sendToRenderer("native:capture-empty", {
    windowMode: sourceWindowMode,
    source: copySelectionFirst ? "selection" : "clipboard"
  });
}

async function captureScreenshotRegion() {
  if (process.platform !== "darwin") {
    return false;
  }

  const permission = await acquireScreenCapturePermission({
    getStatus: () => systemPreferences.getMediaAccessStatus("screen"),
    nativePermission: nativeScreenCapturePermission,
    openSettings: () => shell.openExternal(SCREEN_CAPTURE_SETTINGS_URL),
    requestAlreadyAttempted: screenCapturePermissionRequestAttempted
  });
  screenCapturePermissionRequestAttempted ||= permission.requestAttempted === true;
  if (!permission.granted) {
    sendToRenderer("native:status", {
      available: true,
      code: "screen_recording_permission",
      message:
        permission.reason === "native-helper-unavailable"
          ? "Pin It couldn't request Screen Recording permission."
          : permission.settingsOpened
            ? "Enable Pin It under Screen & System Audio Recording, then reopen Pin It."
            : "Allow Pin It to record your screen and audio, then reopen Pin It."
    });
    return false;
  }

  const sourceWindowMode = currentWindowMode;
  const tempPath = path.join(app.getPath("temp"), `pinit-region-${randomUUID()}.png`);

  try {
    await execFileAsync("screencapture", screenshotCaptureArgs(tempPath));
  } catch (error) {
    const hasCapture = await fileHasBytes(tempPath);
    if (!hasCapture) {
      if (isScreenRecordingPermissionError(error)) {
        sendToRenderer("native:status", {
          available: true,
          code: "screen_recording_permission",
          message: "Refresh Screen Recording permission in System Settings."
        });
        return false;
      }

      if (error?.code !== 1) {
        sendToRenderer("native:status", { available: true, message: "Couldn't save capture." });
      }
      return false;
    }
  }

  if (!(await fileHasBytes(tempPath))) {
    return false;
  }

  try {
    const storeFiles = await storeFilesPromise;
    const pinId = randomUUID();
    const imagePath = storeFiles.resolvePinImagePath(pinId);
    await fs.mkdir(path.dirname(imagePath), { recursive: true });
    await fs.rename(tempPath, imagePath);
    sendToRenderer("native:capture", {
      id: pinId,
      title: "Screenshot",
      content: `![Screenshot](pinit://pin/${pinId}/image)`,
      contentType: "Image",
      imagePath: path.join("images", `${pinId}.png`),
      windowMode: sourceWindowMode,
      source: "screenshot"
    });
    return true;
  } catch {
    await fs.rm(tempPath, { force: true }).catch(() => {});
    sendToRenderer("native:status", { available: true, message: "Couldn't save capture." });
    return false;
  }
}

function isScreenRecordingPermissionError(error) {
  const output = `${error?.message || ""}\n${error?.stderr || ""}\n${error?.stdout || ""}`;
  if (/permission|not authorized|not authorised|denied|privacy|screen recording|tcc|not permitted/i.test(output)) {
    return true;
  }

  try {
    const status = systemPreferences.getMediaAccessStatus("screen");
    return status === "denied" || status === "restricted";
  } catch {
    return false;
  }
}

function execFileAsync(command, args) {
  return new Promise((resolve, reject) => {
    execFile(command, args, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

async function fileHasBytes(filePath) {
  try {
    const stats = await fs.stat(filePath);
    return stats.size > 0;
  } catch {
    return false;
  }
}

function readClipboardSnapshot() {
  const text = clipboard.readText();
  const html = clipboard.readHTML();
  const image = clipboard.readImage();
  const imageDataUrl = image && !image.isEmpty() ? image.toDataURL() : "";
  const clipboardFormats = compactClipboardFormats({ html, imageDataUrl, text });

  if (text?.trim()) {
    return {
      payload: {
        content: text,
        clipboardFormats
      }
    };
  }

  if (imageDataUrl) {
    return {
      payload: {
        content: `![Clipboard image](${imageDataUrl})`,
        contentType: "Image",
        clipboardFormats
      }
    };
  }

  if (html?.trim()) {
    return {
      payload: {
        content: html,
        contentType: "HTML",
        clipboardFormats
      }
    };
  }

  return { payload: null };
}

function compactClipboardFormats({ html = "", imageDataUrl = "", text = "" }) {
  return {
    ...(text?.trim() ? { text } : {}),
    ...(html?.trim() ? { html } : {}),
    ...(imageDataUrl ? { imageDataUrl } : {})
  };
}

async function waitForClipboardRefresh(previousSignature) {
  const startedAt = Date.now();
  let latest = readClipboardSnapshot();

  while (Date.now() - startedAt < 520) {
    const signature = clipboardSnapshotSignature(latest);
    const formats = latest.payload?.clipboardFormats || {};
    const hasText = Boolean(formats.text?.trim());
    const hasRichTable = /<table\b/i.test(formats.html || "");

    if (signature && signature !== previousSignature && (!hasText || hasRichTable || Date.now() - startedAt >= 260)) {
      return latest;
    }

    await wait(40);
    latest = readClipboardSnapshot();
  }

  return latest;
}

function clipboardSnapshotSignature(snapshot) {
  const formats = snapshot?.payload?.clipboardFormats || {};
  return [
    snapshot?.payload?.content || "",
    formats.text || "",
    formats.html || "",
    formats.imageDataUrl || ""
  ].join("\n---clipboard-format---\n");
}

function copyCurrentSelection() {
  if (process.platform !== "darwin") {
    return Promise.resolve(false);
  }

  return new Promise((resolve) => {
    execFile(
      "osascript",
      ["-e", 'tell application "System Events" to keystroke "c" using command down'],
      (error) => resolve(!error)
    );
  });
}

function showWindow() {
  if (!mainWindow) {
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.show();
  mainWindow.focus();
}

function showWindowInactive() {
  if (!mainWindow) {
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  } else if (mainWindow.isVisible()) {
    return;
  }

  if (typeof mainWindow.showInactive === "function") {
    mainWindow.showInactive();
    return;
  }

  mainWindow.show();
}

function applyWindowMode(mode, { show = true, activate = true } = {}) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  const nextMode = windowModes[mode] ? mode : "dock";
  const config = windowModes[nextMode];
  const currentBounds = mainWindow.getBounds();
  const anchorPoint = hasAppliedInitialBounds
    ? { x: currentBounds.x + Math.round(currentBounds.width / 2), y: currentBounds.y + Math.round(currentBounds.height / 2) }
    : screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(anchorPoint);
  const { x, y, width, height } = display.workArea;
  const margin = 10;
  const targetCenterY = hasAppliedInitialBounds ? currentBounds.y + currentBounds.height / 2 : y + height / 2;
  const targetX =
    sidecarSide === "left" ? x + margin : x + width - config.width - margin;
  const nextBounds = {
    width: config.width,
    height: config.height,
    x: Math.round(clamp(targetX, x + margin, x + width - config.width - margin)),
    y: Math.round(clamp(targetCenterY - config.height / 2, y + margin, y + height - config.height - margin))
  };

  const [minWidth, minHeight] = mainWindow.getMinimumSize();
  const minSizeChanged = minWidth !== config.width || minHeight !== config.height;
  const boundsChanged = !boundsEqual(currentBounds, nextBounds);

  if (mainWindow.isResizable() !== config.resizable) {
    mainWindow.setResizable(config.resizable);
  }
  if (minSizeChanged) {
    mainWindow.setMinimumSize(config.width, config.height);
  }
  if (boundsChanged) {
    mainWindow.setBounds(nextBounds, false);
  }
  if (!mainWindow.isAlwaysOnTop()) {
    mainWindow.setAlwaysOnTop(true, "floating");
  }
  currentWindowMode = nextMode;
  hasAppliedInitialBounds = true;

  if (show) {
    if (activate) {
      showWindow();
    } else {
      showWindowInactive();
    }
  }
}

function moveWindowBy(delta = {}) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return sidecarSide;
  }

  const dx = Number(delta.dx) || 0;
  const dy = Number(delta.dy) || 0;

  if (!dx && !dy) {
    return sidecarSide;
  }

  const bounds = mainWindow.getBounds();
  mainWindow.setBounds(
    {
      x: Math.round(bounds.x + dx),
      y: Math.round(bounds.y + dy),
      width: bounds.width,
      height: bounds.height
    },
    false
  );
  hasAppliedInitialBounds = true;
  return sidecarSide;
}

function snapWindowToNearestSide() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return sidecarSide;
  }

  const bounds = mainWindow.getBounds();
  const centerPoint = {
    x: bounds.x + Math.round(bounds.width / 2),
    y: bounds.y + Math.round(bounds.height / 2)
  };
  const display = screen.getDisplayNearestPoint(centerPoint);
  const { x, y, width, height } = display.workArea;
  const margin = 10;
  sidecarSide = centerPoint.x < x + width / 2 ? "left" : "right";

  const nextBounds = {
    width: bounds.width,
    height: bounds.height,
    x: sidecarSide === "left" ? x + margin : x + width - bounds.width - margin,
    y: Math.round(clamp(bounds.y, y + margin, y + height - bounds.height - margin))
  };

  mainWindow.setBounds(nextBounds, false);
  hasAppliedInitialBounds = true;
  notifySidecarSide();
  return sidecarSide;
}

function notifySidecarSide() {
  sendToRenderer("native:sidecar-side", { side: sidecarSide });
}

function boundsEqual(left, right) {
  return left.x === right.x && left.y === right.y && left.width === right.width && left.height === right.height;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

async function reloadAppWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  if (startupStorageRecovery) {
    const migration = await migrateExistingStoreImages();
    if (migration.fatal) {
      startupStorageRecovery = migration;
      loadStorageRecoveryPage(migration);
      return;
    }
    startupStorageRecovery = null;
  }

  loadAppRenderer();
}

function loadAppRenderer() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  if (isDev) {
    mainWindow.loadURL(devUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }
}

function quitApp() {
  app.isQuitting = true;
  globalShortcut.unregisterAll();
  BrowserWindow.getAllWindows().forEach((window) => {
    if (!window.isDestroyed()) {
      window.destroy();
    }
  });
  app.exit(0);
}

function sendToRenderer(channel, payload = {}) {
  if (!mainWindow || mainWindow.webContents.isLoading()) {
    return;
  }

  mainWindow.webContents.send(channel, payload);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function dataFilePath() {
  const storeFiles = await storeFilesPromise;
  return storeFiles.resolveStorePath();
}

async function storeQueue() {
  if (!enqueueStoreWrite) {
    const { createWriteQueue } = await writeQueuePromise;
    enqueueStoreWrite = createWriteQueue();
  }
  return enqueueStoreWrite;
}

async function writeStoreText(value) {
  return (await storeQueue())(async () => {
    const storeFiles = await storeFilesPromise;
    const filePath = await dataFilePath();
    const previousText = await storeFiles.readStoreText(filePath);
    const { text, migrated } = storeFiles.migrateImageDataUrlsInText(value || "", {
      writeImage: ({ buffer, pinId }) => {
        const imagePath = storeFiles.resolvePinImagePath(pinId);
        fsSync.mkdirSync(path.dirname(imagePath), { recursive: true });
        fsSync.writeFileSync(imagePath, buffer);
      }
    });
    await storeFiles.atomicWriteText(filePath, text || "");
    const cleanup = await storeFiles.removeDeletedPinImages({
      previousText,
      nextText: text || "",
      storePath: filePath
    });
    if (cleanup.failed) {
      console.warn(`Could not remove ${cleanup.failed} deleted pin image file(s).`);
    }
    return { text, migrated, removedImages: cleanup.ids.length - cleanup.failed };
  });
}

async function completeStorageCutover(localStoreText) {
  return (await storeQueue())(async () => {
    const storeFiles = await storeFilesPromise;
    const result = await storeFiles.completeStorageCutover({
      localStoreText,
      storePath: await dataFilePath()
    });
    const migration = await storeFiles.migrateStoreImagesSafely({ storePath: await dataFilePath() });
    return migration.text || result.text || "";
  });
}

async function migrateExistingStoreImages() {
  return (await storeQueue())(async () => {
    const storeFiles = await storeFilesPromise;
    return storeFiles.migrateStoreImagesSafely({ storePath: await dataFilePath() });
  });
}

async function registerPinitProtocol() {
  const storeFiles = await storeFilesPromise;
  protocol.handle("pinit", async (request) => {
    const url = new URL(request.url);
    const match = url.pathname.match(/^\/([^/]+)\/image$/);
    if (url.hostname !== "pin" || !match) {
      return new Response("Not found", { status: 404 });
    }

    try {
      const imagePath = storeFiles.resolvePinImagePath(match[1]);
      await fs.access(imagePath);
      return net.fetch(pathToFileURL(imagePath).toString());
    } catch {
      return new Response("Image not found", { status: 404 });
    }
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

handleTrustedIpc("native:info", async () => {
  const credential = await readOpenAIKey();
  return {
    available: true,
    platform: process.platform,
    shortcutLabel: screenshotHotkey ? `${hotkey} / ${screenshotHotkey}` : hotkey,
    status: "Electron ready",
    mcpServerPath: bundledMcpServerPath(),
    mcpServerName: appChannel.mcpServerName,
    mcpSetup: mcpSetupState,
    nodePath: process.execPath,
    storagePath: await dataFilePath(),
    windowMode: currentWindowMode,
    sidecarSide,
    onboarding: onboardingState,
    ai: openAIStatus({
      configured: Boolean(credential.key),
      source: credential.source,
      errorCode: credential.errorCode
    })
  };
});

handleTrustedIpc("native:show-window", () => showWindow());
handleTrustedIpc("native:hide-window", () => mainWindow?.hide(), { allowRecovery: true });
handleTrustedIpc("native:reload-window", () => reloadAppWindow(), { allowRecovery: true });
handleTrustedIpc("native:quit", () => quitApp(), { allowRecovery: true });
handleTrustedIpc("native:set-window-mode", (_event, mode, options = {}) => applyWindowMode(mode, options));
handleTrustedIpc("native:move-window-by", (_event, delta) => moveWindowBy(delta));
handleTrustedIpc("native:snap-window-to-side", () => snapWindowToNearestSide());
handleTrustedIpc("native:capture-clipboard", (_event, options = {}) => captureClipboard(options));
handleTrustedIpc("native:capture-screenshot-region", () => captureScreenshotRegion());
handleTrustedIpc("native:complete-onboarding-step", (_event, step) => completeOnboardingStep(step));
ipcMain.handle("native:onboarding-copy-sample", (event) => {
  if (!isTrustedOnboardingIpc(event)) {
    throw new Error("Blocked untrusted onboarding IPC request.");
  }
  clipboard.writeText(onboardingSampleText);
  return true;
});
handleTrustedIpc("native:write-clipboard", (_event, payload) => writeClipboardPayload(payload));
handleTrustedIpc("native:copy-pin-image", async (_event, pinId) => copyPinImage(pinId));
handleTrustedIpc("native:read-pin-image-data-url", async (_event, pinId) => readPinImageDataUrl(pinId));
handleTrustedIpc("native:write-pin-image", async (_event, payload = {}) => writePinImage(payload));
handleTrustedIpc("native:open-url", async (_event, url) => {
  if (typeof url === "string" && /^https:\/\/github\.com\/johnnyzhoujz\/pin-it\/releases\b/.test(url)) {
    await shell.openExternal(url);
    return true;
  }
  return false;
});
handleTrustedIpc("native:generate-pin-title", async (_event, payload = {}) => {
  const credential = await readOpenAIKey();
  return generatePinTitle(payload, { apiKey: credential.key });
});
handleTrustedIpc("native:refresh-openai-api-key-status", async () => {
  const credential = await readOpenAIKey();
  return openAIStatus({
    configured: Boolean(credential.key),
    source: credential.source,
    errorCode: credential.errorCode
  });
});
handleTrustedIpc("native:save-openai-api-key", async (_event, value = "") => {
  try {
    const source = await saveOpenAIKey(value);
    return { ...openAIStatus({ configured: true, source }), ok: true, message: "" };
  } catch (error) {
    const keychainUnavailable = isCredentialAccessError(error);
    return {
      ...openAIStatus({ configured: false, errorCode: keychainUnavailable ? "credential_save_unavailable" : "credential_save_failed" }),
      ok: false,
      message: keychainUnavailable
        ? "Could not access secure credential storage. Unlock your login Keychain, reopen Pin It, and try again."
        : "Could not save the OpenAI API key."
    };
  }
});
handleTrustedIpc("native:clear-openai-api-key", async () => {
  await clearOpenAIKey();
  const credential = await readOpenAIKey();
  return openAIStatus({
    configured: Boolean(credential.key),
    source: credential.source,
    errorCode: credential.errorCode
  });
});

handleTrustedIpc("native:read-store", async () => {
  try {
    return await fs.readFile(await dataFilePath(), "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      return "";
    }
    throw error;
  }
});

handleTrustedIpc("native:write-store", async (_event, value) => {
  const result = await writeStoreText(value);
  return result.text;
});

handleTrustedIpc("native:complete-storage-cutover", async (_event, value) => completeStorageCutover(value));

async function writeClipboardPayload(payload) {
  if (payload && typeof payload === "object" && typeof payload.pinId === "string") {
    return copyPinImage(payload.pinId);
  }

  if (payload && typeof payload === "object" && typeof payload.imageDataUrl === "string") {
    const image = nativeImage.createFromDataURL(payload.imageDataUrl);
    if (!image.isEmpty()) {
      clipboard.write({ image });
      return true;
    }
  }

  clipboard.writeText(typeof payload === "string" ? payload : payload?.text || "");
  return true;
}

async function copyPinImage(pinId) {
  const storeFiles = await storeFilesPromise;
  const imagePath = storeFiles.resolvePinImagePath(pinId);
  const image = nativeImage.createFromPath(imagePath);
  if (image.isEmpty()) {
    throw new Error("Pin image file is missing.");
  }

  clipboard.write({ image });
  return true;
}

async function readPinImageDataUrl(pinId) {
  const storeFiles = await storeFilesPromise;
  const imagePath = storeFiles.resolvePinImagePath(pinId);
  const image = nativeImage.createFromPath(imagePath);
  if (image.isEmpty()) {
    throw new Error("Pin image file is missing.");
  }

  return image.toDataURL();
}

async function writePinImage({ imageDataUrl = "", pinId = "" } = {}) {
  const storeFiles = await storeFilesPromise;
  const image = nativeImage.createFromDataURL(imageDataUrl);
  if (image.isEmpty()) {
    throw new Error("Invalid pin image.");
  }

  const imagePath = storeFiles.resolvePinImagePath(pinId);
  await fs.mkdir(path.dirname(imagePath), { recursive: true });
  await fs.writeFile(imagePath, image.toPNG());
  return {
    imagePath: path.join("images", `${pinId}.png`)
  };
}

async function checkForUpdates() {
  if (appChannel.id === "development") {
    return;
  }

  const forceUnsigned = process.env.PIN_IT_FORCE_UNSIGNED_UPDATER === "1";
  const skipAutoUpdater = process.env.PIN_IT_SKIP_AUTO_UPDATER === "1";

  const hasUpdateConfig = fsSync.existsSync(path.join(process.resourcesPath || "", "app-update.yml"));
  const hasDeveloperIdSignature = await detectDeveloperIdSignature();

  if (
    isAutoUpdaterEligible({
      forceUnsigned,
      hasDeveloperIdSignature,
      hasUpdateConfig,
      isPackaged: app.isPackaged,
      platform: process.platform,
      skipAutoUpdater
    })
  ) {
    autoUpdater.channel = autoUpdateChannel;
    autoUpdater.autoDownload = true;
    try {
      await autoUpdater.checkForUpdatesAndNotify();
      return;
    } catch {
      // A signed build still gets the manual release check if auto-update fails.
    }
  }

  try {
    const update = await checkManualUpdate({ currentVersion: app.getVersion() });
    if (update.available) {
      sendToRenderer("native:update-available", update);
    }
  } catch {
    // Offline and GitHub API failures are intentionally silent.
  }
}

async function detectDeveloperIdSignature() {
  if (!app.isPackaged || process.platform !== "darwin") {
    return false;
  }

  try {
    const result = await execFileAsync("codesign", ["-dv", "--verbose=4", app.getPath("exe")]);
    return hasDeveloperIdSignatureOutput(`${result.stdout}\n${result.stderr}`);
  } catch (error) {
    return hasDeveloperIdSignatureOutput(`${error?.stdout || ""}\n${error?.stderr || ""}`);
  }
}

app.whenReady().then(async () => {
  if (!hasSingleInstanceLock) {
    return;
  }

  if (isMcpSetupSelftest) {
    mcpSetupState = await configureBundledMcpClients();
    const result = {
      ok: mcpSetupState.failed.length === 0,
      channel: appChannel.id,
      productName,
      appId: appChannel.appId,
      mcpServerName: appChannel.mcpServerName,
      setup: mcpSetupState
    };
    process.stdout.write(`${JSON.stringify(result)}\n`, () => app.exit(result.ok ? 0 : 1));
    return;
  }

  await registerPinitProtocol();
  const migration = await migrateExistingStoreImages();
  if (migration.fatal) {
    startupStorageRecovery = migration;
  } else if (migration.failed) {
    console.warn(`Pin image migration was skipped: ${migration.errorMessage}`);
  }
  await initializeOnboardingState();
  mcpSetupState = await configureBundledMcpClients();
  for (const result of mcpSetupState.results || []) {
    if (result.action === "failed") {
      console.warn(`Automatic MCP setup failed for ${result.label}: ${result.errorMessage}`);
    }
  }
  createWindow({ storageRecovery: startupStorageRecovery });
  createTray();
  createApplicationMenu();
  registerHotkey();
  syncOnboardingWindows();
  checkForUpdates();

  app.on("second-instance", () => {
    showWindow();
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else {
      showWindow();
    }
  });

  screen.on("display-added", syncOnboardingWindows);
  screen.on("display-removed", syncOnboardingWindows);
  screen.on("display-metrics-changed", syncOnboardingWindows);
});

app.on("before-quit", () => {
  app.isQuitting = true;
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});

app.on("window-all-closed", (event) => {
  if (!app.isQuitting) {
    event.preventDefault();
  }
});
