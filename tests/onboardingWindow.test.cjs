const assert = require("node:assert/strict");
const {
  ONBOARDING_WINDOW_LEVEL,
  ONBOARDING_WINDOW_SIZE,
  onboardingWindowBounds,
  onboardingWindowOptions,
  shouldCopySelectionBeforeCapture
} = require("../electron/onboardingWindow.cjs");

const display = {
  bounds: { x: 0, y: 0, width: 1728, height: 1117 },
  workArea: { x: 0, y: 25, width: 1728, height: 1067 }
};

assert.deepEqual(onboardingWindowBounds(display), {
  width: ONBOARDING_WINDOW_SIZE.width,
  height: ONBOARDING_WINDOW_SIZE.height,
  x: 504,
  y: 289
});

const options = onboardingWindowOptions({
  display,
  preload: "/tmp/onboardingPreload.cjs",
  title: "Pin It Dev onboarding"
});

assert.equal(options.width < display.workArea.width, true);
assert.equal(options.height < display.workArea.height, true);
assert.equal(options.alwaysOnTop, true);
assert.equal(options.hasShadow, false);
assert.equal(options.focusable, true);
assert.equal(options.movable, true);
assert.equal(options.fullscreenable, false);
assert.equal(options.webPreferences.preload, "/tmp/onboardingPreload.cjs");
assert.equal("modal" in options, false);
assert.equal(ONBOARDING_WINDOW_LEVEL, "floating");

assert.equal(shouldCopySelectionBeforeCapture({ clipboardLessonComplete: false }), false);
assert.equal(shouldCopySelectionBeforeCapture({ clipboardLessonComplete: true }), true);

console.log("onboarding window tests passed");
