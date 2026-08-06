import React, { useEffect, useRef } from "react";
import {
  Check,
  Desktop,
  Key,
  Moon,
  SealCheck,
  Sun,
  Terminal,
  Trash,
  WarningCircle,
  X
} from "@phosphor-icons/react";
import { providerStatusLabel } from "./settingsModel.js";
import { Button } from "../components/ui/button.jsx";
import { Input } from "../components/ui/input.jsx";

export function SettingsDialog({
  activeTheme,
  apiKeyDraft,
  aiSaving,
  nativeState,
  soundMuted,
  smartTitlesEnabled,
  themePreference,
  onApiKeyDraft,
  onClearApiKey,
  onClose,
  onRetryApiKeyStorage,
  onSaveApiKey,
  onSoundMuted,
  onSmartTitlesEnabled,
  onThemePreference
}) {
  const dialogRef = useRef(null);
  const aiConfigured = Boolean(nativeState.ai?.configured);
  const aiSource = nativeState.ai?.source || "";
  const credentialErrorCode = nativeState.ai?.errorCode || "";
  const keychainUnavailable = credentialErrorCode === "keychain_unavailable" || credentialErrorCode === "credential_save_unavailable";
  const saveUnavailable = credentialErrorCode === "credential_save_unavailable";
  const canClearSavedKey = aiConfigured && aiSource !== "environment" && !keychainUnavailable;
  const themeOptions = [
    { icon: Sun, label: "Light", value: "light" },
    { icon: Moon, label: "Dark", value: "dark" },
    { icon: Desktop, label: "System", value: "system" }
  ];

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  return (
    <section className="settings-modal" aria-label="Settings" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div className="settings-dialog" ref={dialogRef} role="dialog" aria-modal="true" tabIndex={-1}>
        <header className="settings-head">
          <div>
            <h2>Settings</h2>
            <p>Configure OpenAI access to generate titles for each pin.</p>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Close settings">
            <X aria-hidden="true" />
          </Button>
        </header>

        <div className="settings-grid">
          <section className="settings-section settings-section-provider" aria-label="OpenAI settings">
            <div className="settings-provider">
              <Key aria-hidden="true" />
              <div>
                <strong>OpenAI</strong>
                <p>{providerStatusLabel(nativeState.ai)}</p>
              </div>
            </div>

            {keychainUnavailable ? (
              <div className="settings-key-status settings-key-error" role="alert" aria-label="OpenAI API key access issue">
                <WarningCircle weight="fill" aria-hidden="true" />
                <div>
                  <strong>{saveUnavailable ? "Key not saved" : "Secure storage unavailable"}</strong>
                  <p>
                    {saveUnavailable
                      ? "Pin It could not access secure storage. Unlock your login Keychain, then reopen Pin It."
                      : "Pin It cannot check for a saved key. Unlock your login Keychain, then reopen Pin It."}
                  </p>
                  <Button type="button" variant="secondary" size="sm" onClick={onRetryApiKeyStorage} disabled={aiSaving}>
                    Retry Keychain
                  </Button>
                </div>
              </div>
            ) : aiConfigured ? (
              <div className="settings-key-status" aria-label="Stored OpenAI API key status">
                <SealCheck weight="fill" aria-hidden="true" />
                <div>
                  <strong>Key stored</strong>
                  <p>{aiSource === "environment" ? "Managed by environment variable." : "Saved securely. The value is hidden."}</p>
                </div>
              </div>
            ) : null}

            <label className="field-label settings-key-field">
              {aiConfigured ? "Replace API key" : "API key"}
              <div className="settings-key-row">
                <Input
                  type="password"
                  autoComplete="off"
                  aria-label="OpenAI API key"
                  placeholder={aiConfigured ? "Paste a new key to replace the stored key" : "Paste OpenAI API key"}
                  value={apiKeyDraft}
                  disabled={aiSaving || keychainUnavailable}
                  onChange={(event) => onApiKeyDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      onSaveApiKey();
                    }
                  }}
                />
                <Button type="button" variant="primary" onClick={onSaveApiKey} disabled={aiSaving || keychainUnavailable}>
                  <Check weight="bold" aria-hidden="true" />
                  {aiConfigured ? "Save new key" : "Save key"}
                </Button>
                {aiConfigured ? (
                  <Button type="button" variant="dangerGhost" onClick={onClearApiKey} disabled={aiSaving || !canClearSavedKey}>
                    <Trash aria-hidden="true" />
                    Delete
                  </Button>
                ) : null}
              </div>
            </label>
          </section>

          <section className="settings-section settings-section-appearance" aria-label="Appearance settings">
            <div className="settings-provider">
              <Desktop aria-hidden="true" />
              <div>
                <strong>Appearance</strong>
                <p>Choose a fixed palette or follow the macOS system setting.</p>
              </div>
            </div>

            <div className="theme-choice" role="radiogroup" aria-label="Theme">
              {themeOptions.map((option) => {
                const Icon = option.icon;
                const selected = themePreference === option.value;

                return (
                  <button
                    key={option.value}
                    className={`theme-option ${selected ? "selected" : ""}`}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => onThemePreference(option.value)}
                  >
                    <Icon weight={selected ? "fill" : "regular"} aria-hidden="true" />
                    <span>{option.label}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="settings-section settings-section-capture" aria-label="Capture behavior settings">
            <div className="settings-toggle">
              <input
                id="mute-capture-sound"
                type="checkbox"
                checked={soundMuted}
                onChange={(event) => onSoundMuted(event.target.checked)}
              />
              <label className="settings-toggle-title" htmlFor="mute-capture-sound">
                Mute capture sound
              </label>
            </div>

            <div className="settings-toggle">
              <input
                id="generate-smart-titles"
                type="checkbox"
                checked={aiConfigured && smartTitlesEnabled}
                disabled={!aiConfigured}
                aria-describedby="generate-smart-titles-note"
                onChange={(event) => onSmartTitlesEnabled(event.target.checked)}
              />
              <span className="settings-toggle-copy">
                <label className="settings-toggle-title" htmlFor="generate-smart-titles">
                  Auto generate title
                </label>
                <span className="settings-note" id="generate-smart-titles-note">
                  {keychainUnavailable
                    ? "Title generation is paused until macOS Keychain access is restored."
                    : aiConfigured
                      ? "When enabled, Pin It calls the OpenAI API with your API key and sends a short text excerpt or captured image to generate the title."
                      : "Add an OpenAI API key to generate titles for each pin. When enabled, Pin It sends a short text excerpt or captured image to OpenAI."}
                </span>
              </span>
            </div>
          </section>

          <section className="settings-section settings-section-wide" aria-label="MCP settings">
            <div className="settings-provider">
              <Terminal aria-hidden="true" />
              <div>
                <strong>MCP server</strong>
                <p>Read-only MCP server for Codex, Claude Code, Cursor, and other MCP clients.</p>
                <p>{mcpSetupStatusText(nativeState.mcpSetup)}</p>
              </div>
            </div>
            <pre className="settings-code">{mcpConfigText(nativeState)}</pre>
          </section>
        </div>
      </div>
    </section>
  );
}

function mcpConfigText(nativeState = {}) {
  const command = nativeState.nodePath || "/absolute/path/to/node";
  const serverName = nativeState.mcpServerName || "pin-it";
  const serverPath = nativeState.mcpServerPath || "<repo>/dist-mcp/pinit-mcp.mjs";
  const storePath = nativeState.storagePath || "~/Library/Application Support/Keep That/keeps.json";
  return JSON.stringify(
    {
      mcpServers: {
        [serverName]: {
          command,
          args: [serverPath],
          env: {
            ELECTRON_RUN_AS_NODE: "1",
            PINIT_MCP_SERVER_NAME: serverName,
            PINIT_STORE_PATH: storePath
          }
        }
      }
    },
    null,
    2
  );
}

function mcpSetupStatusText(mcpSetup = {}) {
  const labels = {
    codex: "Codex",
    "claude-code": "Claude Code",
    "claude-desktop": "Claude Desktop",
    cursor: "Cursor"
  };
  const failed = Array.isArray(mcpSetup.failed) ? mcpSetup.failed : [];
  if (failed.length) {
    return `Automatic setup needs attention for ${failed.map((id) => labels[id] || id).join(", ")}. Reopen Pin It after repairing that client’s configuration.`;
  }
  const configured = Array.isArray(mcpSetup.configured) ? mcpSetup.configured : [];
  if (!configured.length) {
    return "Pin It configures supported MCP clients automatically when the packaged app opens.";
  }
  return `Configured automatically for ${configured.map((id) => labels[id] || id).join(", ")}. Restart clients that were already open during setup.`;
}
