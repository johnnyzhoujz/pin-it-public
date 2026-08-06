const assert = require("node:assert/strict");
const {
  ONBOARDING_FLOW_VERSION,
  freshOnboardingState,
  normalizeOnboardingState
} = require("../electron/onboardingState.cjs");

const fresh = freshOnboardingState();
assert.deepEqual(fresh, {
  flowVersion: ONBOARDING_FLOW_VERSION,
  clipboardLessonComplete: false,
  screenshotLessonComplete: false
});

assert.deepEqual(
  normalizeOnboardingState({ clipboardLessonComplete: true, screenshotLessonComplete: true }),
  fresh,
  "legacy unversioned completion must not suppress the current onboarding flow"
);
assert.deepEqual(
  normalizeOnboardingState({
    flowVersion: ONBOARDING_FLOW_VERSION,
    clipboardLessonComplete: true,
    screenshotLessonComplete: false
  }),
  {
    flowVersion: ONBOARDING_FLOW_VERSION,
    clipboardLessonComplete: true,
    screenshotLessonComplete: false
  }
);
assert.deepEqual(
  normalizeOnboardingState({
    flowVersion: ONBOARDING_FLOW_VERSION + 1,
    clipboardLessonComplete: true,
    screenshotLessonComplete: true
  }),
  fresh
);

console.log("onboarding state tests passed");
