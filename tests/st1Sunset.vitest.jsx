import React from "react";
import Module from "node:module";
import { createRequire } from "node:module";
import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const STORAGE_KEY = "keep-that:prototype:v4";

function seedBoardState() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      projectName: "Deck",
      draftContent: "",
      metaPrompt: "",
      metaPromptsByProject: { Deck: "Legacy prompt data" },
      projects: {},
      soundMuted: false,
      smartTitlesEnabled: true,
      themePreference: "system",
      selectedIdsByProject: { Deck: ["first"] },
      snippets: [
        {
          id: "first",
          title: "First useful note",
          content: "Save friction should be almost zero.",
          contentType: "Text",
          projectName: "Deck",
          order: 0,
          createdAt: "2026-06-06T18:00:00.000Z"
        }
      ]
    })
  );
}

function loadPreloadBridge() {
  const originalLoad = Module._load;
  const preloadPath = require.resolve("../electron/preload.cjs");
  const ipcRenderer = {
    invoke: vi.fn(),
    on: vi.fn(),
    removeListener: vi.fn()
  };
  let exposedApi = null;

  delete require.cache[preloadPath];
  Module._load = function load(request, parent, isMain) {
    if (request === "electron") {
      return {
        contextBridge: {
          exposeInMainWorld: (_name, api) => {
            exposedApi = api;
          }
        },
        ipcRenderer
      };
    }

    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    require(preloadPath);
  } finally {
    Module._load = originalLoad;
    delete require.cache[preloadPath];
  }

  return exposedApi;
}

describe("ST1 sunset", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.resetModules();
    localStorage.clear();
    document.body.innerHTML = "";
  });

  it("shows one board export and keeps automatic title settings", async () => {
    globalThis.React = React;
    seedBoardState();
    document.body.innerHTML = '<div id="app"></div>';

    await act(async () => {
      await import("../src/main.jsx");
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /board/i }));
    });

    expect(screen.getByRole("button", { name: /copy selected/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /copy raw/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /combine/i })).toBeNull();
    expect(screen.queryByLabelText(/prompt composer/i)).toBeNull();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /settings/i }));
    });

    expect(screen.getByLabelText("OpenAI API key")).toBeTruthy();
    expect(screen.getByText("Configure OpenAI access to generate titles for each pin.")).toBeTruthy();
  });

  it("does not expose the removed meta-prompt bridge from preload", () => {
    const api = loadPreloadBridge();

    expect(api).toBeTruthy();
    expect(api.generateMetaPrompt).toBeUndefined();
    expect(api.generatePinTitle).toEqual(expect.any(Function));
    expect(api.completeOnboardingStep).toEqual(expect.any(Function));
    expect(api.captureScreenshotRegion).toEqual(expect.any(Function));
  });
});
