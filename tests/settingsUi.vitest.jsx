import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SettingsDialog } from "../src/settings/SettingsDialog.jsx";

globalThis.React = React;

const settingsProps = {
  activeTheme: "light",
  apiKeyDraft: "",
  aiSaving: false,
  nativeState: {
    ai: { configured: true, model: "gpt-5.6-luna", source: "keychain" },
    mcpServerPath: "/Applications/Pin It.app/Contents/Resources/app.asar.unpacked/dist-mcp/pinit-mcp.mjs",
    mcpSetup: {
      configured: ["codex", "claude-code", "claude-desktop", "cursor"],
      failed: []
    },
    nodePath: "/Applications/Pin It.app/Contents/MacOS/Pin It",
    storagePath: "/tmp/keeps.json"
  },
  soundMuted: false,
  smartTitlesEnabled: true,
  themePreference: "light",
  onApiKeyDraft: vi.fn(),
  onClearApiKey: vi.fn(),
  onClose: vi.fn(),
  onRetryApiKeyStorage: vi.fn(),
  onSaveApiKey: vi.fn(),
  onSoundMuted: vi.fn(),
  onSmartTitlesEnabled: vi.fn(),
  onThemePreference: vi.fn()
};

describe("settings UI regressions", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  it("focuses the scrollable dialog when settings opens", () => {
    render(<SettingsDialog {...settingsProps} />);

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBe(document.activeElement);
    expect(dialog.getAttribute("tabindex")).toBe("-1");
    expect(screen.getByRole("radio", { name: "System" })).toBeTruthy();
    expect(screen.queryByText("System (light)")).toBeNull();
  });

  it("shows stored key state without exposing the key value", () => {
    render(<SettingsDialog {...settingsProps} apiKeyDraft="" />);

    const apiKeyInput = screen.getByLabelText("OpenAI API key");
    expect(screen.getByText("Key stored")).toBeTruthy();
    expect(screen.getByText("Ready to generate titles for each pin.")).toBeTruthy();
    expect(screen.queryByText(/gpt-5\.6-luna/i)).toBeNull();
    expect(screen.getByText("Saved securely. The value is hidden.")).toBeTruthy();
    expect(apiKeyInput.value).toBe("");
    expect(apiKeyInput.getAttribute("placeholder")).toBe("Paste a new key to replace the stored key");
    expect(screen.getByRole("button", { name: /save new key/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /delete/i })).toBeTruthy();
    expect(screen.getByText(/calls the OpenAI API with your API key/i)).toBeTruthy();
    expect(
      screen.getByText("Read-only MCP server for Codex, Claude Code, Cursor, and other MCP clients.")
    ).toBeTruthy();
    expect(screen.getByText(/Configured automatically for Codex, Claude Code, Claude Desktop, Cursor/i)).toBeTruthy();
    expect(screen.getByText(/Restart clients that were already open during setup/i)).toBeTruthy();

    const mcpConfig = JSON.parse(document.querySelector(".settings-code").textContent);
    expect(mcpConfig.mcpServers["pin-it"]).toEqual({
      command: "/Applications/Pin It.app/Contents/MacOS/Pin It",
      args: ["/Applications/Pin It.app/Contents/Resources/app.asar.unpacked/dist-mcp/pinit-mcp.mjs"],
      env: {
        ELECTRON_RUN_AS_NODE: "1",
        PINIT_MCP_SERVER_NAME: "pin-it",
        PINIT_STORE_PATH: "/tmp/keeps.json"
      }
    });
  });

  it("disables automatic title generation when no API key is configured", () => {
    render(
      <SettingsDialog
        {...settingsProps}
        nativeState={{ ...settingsProps.nativeState, ai: { configured: false, model: "gpt-5.6-luna" } }}
        smartTitlesEnabled
      />
    );

    const smartTitles = screen.getByRole("checkbox", { name: "Auto generate title" });
    expect(smartTitles.disabled).toBe(true);
    expect(smartTitles.checked).toBe(false);
    expect(screen.getByText(/Add an OpenAI API key to generate titles for each pin/i)).toBeTruthy();
    expect(screen.getByText(/captured image to OpenAI/i)).toBeTruthy();
  });

  it("shows the development MCP name without replacing production", () => {
    render(
      <SettingsDialog
        {...settingsProps}
        nativeState={{ ...settingsProps.nativeState, mcpServerName: "pin-it-dev" }}
      />
    );

    const mcpConfig = JSON.parse(document.querySelector(".settings-code").textContent);
    expect(mcpConfig.mcpServers["pin-it-dev"].env.PINIT_MCP_SERVER_NAME).toBe("pin-it-dev");
    expect(mcpConfig.mcpServers["pin-it"]).toBeUndefined();
  });

  it("distinguishes an unavailable Keychain from a missing API key", () => {
    render(
      <SettingsDialog
        {...settingsProps}
        nativeState={{
          ...settingsProps.nativeState,
          ai: { configured: false, model: "gpt-5.6-luna", errorCode: "keychain_unavailable" }
        }}
        smartTitlesEnabled
      />
    );

    expect(screen.getByRole("alert", { name: "OpenAI API key access issue" })).toBeTruthy();
    expect(screen.getByText("Secure storage unavailable")).toBeTruthy();
    expect(screen.getByText(/cannot check for a saved key/i)).toBeTruthy();
    expect(screen.queryByText("Saved key unavailable")).toBeNull();
    expect(screen.queryByText("Add an API key to generate titles for each pin.")).toBeNull();
    expect(screen.getByLabelText("OpenAI API key").disabled).toBe(true);
    expect(screen.getByRole("button", { name: "Save key" }).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Retry Keychain" }));
    expect(settingsProps.onRetryApiKeyStorage).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("checkbox", { name: "Auto generate title" }).disabled).toBe(true);
    expect(screen.getByText(/Title generation is paused until macOS Keychain access is restored/i)).toBeTruthy();
  });

  it("does not claim a key was saved when secure storage rejected the write", () => {
    render(
      <SettingsDialog
        {...settingsProps}
        nativeState={{
          ...settingsProps.nativeState,
          ai: { configured: false, model: "gpt-5.6-luna", errorCode: "credential_save_unavailable" }
        }}
      />
    );

    expect(screen.getByText("Key not saved")).toBeTruthy();
    expect(screen.getByText(/could not access secure storage/i)).toBeTruthy();
    expect(screen.queryByText("Saved key unavailable")).toBeNull();
    expect(screen.queryByText("Secure storage unavailable")).toBeNull();
    expect(screen.getByLabelText("OpenAI API key").disabled).toBe(true);
    expect(screen.getByRole("button", { name: "Retry Keychain" }).disabled).toBe(false);
  });
});
