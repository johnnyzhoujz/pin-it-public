import { describe, expect, it } from "vitest";
import { isCaptureSuccessNotice } from "../src/sidecar/sidecarModel.js";
import { normalizeThemePreference, providerStatusLabel } from "../src/settings/settingsModel.js";

describe("sidecar model", () => {
  it("identifies capture success notices", () => {
    expect(isCaptureSuccessNotice("Saved")).toBe(true);
    expect(isCaptureSuccessNotice("Captured clipboard")).toBe(true);
    expect(isCaptureSuccessNotice("Clipboard is empty.")).toBe(false);
  });
});

describe("settings model", () => {
  it("normalizes theme preference", () => {
    expect(normalizeThemePreference("dark")).toBe("dark");
    expect(normalizeThemePreference("sepia")).toBe("system");
  });

  it("formats provider status without exposing keys", () => {
    expect(providerStatusLabel({ configured: true, model: "gpt-5.6-luna", source: "keychain" })).toBe(
      "Ready to generate titles for each pin."
    );
    expect(providerStatusLabel({ configured: false })).toBe("Add an API key to generate titles for each pin.");
    expect(providerStatusLabel({ configured: false, errorCode: "keychain_unavailable" })).toBe(
      "macOS Keychain access needs attention."
    );
    expect(providerStatusLabel({ configured: false, errorCode: "credential_save_unavailable" })).toBe(
      "macOS Keychain access needs attention."
    );
  });
});
