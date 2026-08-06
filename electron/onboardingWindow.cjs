const ONBOARDING_WINDOW_SIZE = Object.freeze({ width: 720, height: 540 });
const ONBOARDING_WINDOW_LEVEL = "floating";

function onboardingWindowBounds(display) {
  const workArea = display?.workArea || display?.bounds || { x: 0, y: 0, width: 640, height: 430 };
  const width = Math.min(ONBOARDING_WINDOW_SIZE.width, Math.max(1, workArea.width - 48));
  const height = Math.min(ONBOARDING_WINDOW_SIZE.height, Math.max(1, workArea.height - 48));

  return {
    width,
    height,
    x: Math.round(workArea.x + (workArea.width - width) / 2),
    y: Math.round(workArea.y + (workArea.height - height) / 2)
  };
}

function onboardingWindowOptions({ display, preload, title }) {
  return {
    ...onboardingWindowBounds(display),
    frame: false,
    fullscreenable: false,
    hasShadow: false,
    transparent: true,
    backgroundColor: "#00000000",
    show: false,
    movable: true,
    resizable: false,
    focusable: true,
    skipTaskbar: true,
    alwaysOnTop: true,
    title,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload,
      sandbox: true
    }
  };
}

function shouldCopySelectionBeforeCapture(onboardingState) {
  return Boolean(onboardingState?.clipboardLessonComplete);
}

module.exports = {
  ONBOARDING_WINDOW_LEVEL,
  ONBOARDING_WINDOW_SIZE,
  onboardingWindowBounds,
  onboardingWindowOptions,
  shouldCopySelectionBeforeCapture
};
