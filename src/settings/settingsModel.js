export function normalizeThemePreference(value) {
  return value === "dark" || value === "light" || value === "system" ? value : "system";
}

export function providerStatusLabel(ai = {}) {
  if (ai.errorCode === "keychain_unavailable" || ai.errorCode === "credential_save_unavailable") {
    return "macOS Keychain access needs attention.";
  }

  return ai.configured ? "Ready to generate titles for each pin." : "Add an API key to generate titles for each pin.";
}
