const ONBOARDING_FLOW_VERSION = 1;

function freshOnboardingState() {
  return {
    flowVersion: ONBOARDING_FLOW_VERSION,
    clipboardLessonComplete: false,
    screenshotLessonComplete: false
  };
}

function normalizeOnboardingState(value) {
  if (value?.flowVersion !== ONBOARDING_FLOW_VERSION) {
    return freshOnboardingState();
  }

  return {
    flowVersion: ONBOARDING_FLOW_VERSION,
    clipboardLessonComplete: Boolean(value.clipboardLessonComplete),
    screenshotLessonComplete: Boolean(value.screenshotLessonComplete)
  };
}

module.exports = {
  ONBOARDING_FLOW_VERSION,
  freshOnboardingState,
  normalizeOnboardingState
};
