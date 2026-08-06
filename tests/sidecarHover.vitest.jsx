import React from "react";
import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("sidecar hover behavior", () => {
  afterEach(() => {
    if (globalThis.__KEEP_THAT_REACT_ROOT__) {
      act(() => {
        globalThis.__KEEP_THAT_REACT_ROOT__.unmount();
      });
    }
    delete globalThis.__KEEP_THAT_REACT_ROOT__;
    vi.useRealTimers();
    vi.resetModules();
    localStorage.clear();
    document.body.innerHTML = "";
  });

  async function loadApp() {
    vi.resetModules();
    globalThis.React = React;
    delete globalThis.__KEEP_THAT_REACT_ROOT__;
    localStorage.clear();
    document.body.innerHTML = '<div id="app"></div>';

    await act(async () => {
      await import("../src/main.jsx");
    });
  }

  it("auto-collapses a hover-opened tray after focus, mouseleave, and cleared-draft events", async () => {
    vi.useFakeTimers();
    await loadApp();

    const sidecar = screen.getByLabelText("Pin It sidecar");
    const input = screen.getByLabelText("Capture content");
    const surface = () => document.querySelector(".surface");

    expect(surface().className).toContain("dock-open");

    await act(async () => {
      fireEvent.mouseEnter(sidecar);
      vi.advanceTimersByTime(100);
    });

    expect(surface().className).toContain("capture-open");

    await act(async () => {
      fireEvent.focus(sidecar);
      fireEvent.mouseLeave(sidecar);
      vi.advanceTimersByTime(2000);
    });

    await act(async () => {
      vi.advanceTimersByTime(180);
    });

    expect(surface().className).toContain("dock-open");

    await act(async () => {
      fireEvent.mouseEnter(sidecar);
      vi.advanceTimersByTime(100);
    });

    expect(surface().className).toContain("capture-open");

    await act(async () => {
      fireEvent.change(input, { target: { value: "Temporary draft" } });
      fireEvent.change(input, { target: { value: "" } });
      vi.advanceTimersByTime(2000);
    });

    await act(async () => {
      vi.advanceTimersByTime(180);
    });

    expect(surface().className).toContain("dock-open");
    expect(String(localStorage.getItem("keep-that:prototype:v4") || "")).not.toContain("Temporary draft");
  });

  it("keeps the tray open while the capture textarea is focused", async () => {
    vi.useFakeTimers();
    await loadApp();

    const sidecar = screen.getByLabelText("Pin It sidecar");
    const input = screen.getByLabelText("Capture content");
    const surface = () => document.querySelector(".surface");

    await act(async () => {
      fireEvent.mouseEnter(sidecar);
      vi.advanceTimersByTime(100);
    });

    expect(surface().className).toContain("capture-open");

    await act(async () => {
      input.focus();
      fireEvent.change(input, { target: { value: "Still typing" } });
      fireEvent.mouseLeave(sidecar);
      vi.advanceTimersByTime(2500);
    });

    expect(surface().className).toContain("capture-open");

    await act(async () => {
      input.blur();
      fireEvent.blur(sidecar, { relatedTarget: document.body });
      vi.advanceTimersByTime(2500);
    });

    await act(async () => {
      vi.advanceTimersByTime(180);
    });

    expect(surface().className).toContain("dock-open");
    expect(String(localStorage.getItem("keep-that:prototype:v4") || "")).toContain("Still typing");
  });

  it("saves and closes after focus leaves the sidecar even when Electron preserves textarea focus", async () => {
    vi.useFakeTimers();
    await loadApp();

    const sidecar = screen.getByLabelText("Pin It sidecar");
    const input = screen.getByLabelText("Capture content");
    const projectInput = screen.getByLabelText("Project or artifact");
    const surface = () => document.querySelector(".surface");

    await act(async () => {
      fireEvent.mouseEnter(sidecar);
      vi.advanceTimersByTime(100);
    });

    expect(surface().className).toContain("capture-open");

    await act(async () => {
      projectInput.focus();
      fireEvent.change(projectInput, { target: { value: "New pinboard" } });
      input.focus();
      fireEvent.change(input, { target: { value: "Save on outside click" } });
      fireEvent.blur(sidecar, { relatedTarget: null });
      fireEvent.mouseLeave(sidecar);
      vi.advanceTimersByTime(2000);
    });

    await act(async () => {
      vi.advanceTimersByTime(180);
    });

    expect(document.activeElement).toBe(input);
    expect(surface().className).toContain("dock-open");
    const stored = JSON.parse(localStorage.getItem("keep-that:prototype:v4"));
    expect(stored.snippets.at(-1)).toMatchObject({
      content: "Save on outside click",
      projectName: "New pinboard"
    });
  });

  it("closes an empty tray after focus leaves the sidecar even when Electron preserves textarea focus", async () => {
    vi.useFakeTimers();
    await loadApp();

    const sidecar = screen.getByLabelText("Pin It sidecar");
    const input = screen.getByLabelText("Capture content");
    const surface = () => document.querySelector(".surface");

    await act(async () => {
      fireEvent.mouseEnter(sidecar);
      vi.advanceTimersByTime(100);
    });

    expect(surface().className).toContain("capture-open");

    await act(async () => {
      input.focus();
      fireEvent.blur(sidecar, { relatedTarget: null });
      fireEvent.mouseLeave(sidecar);
      vi.advanceTimersByTime(2000);
    });

    await act(async () => {
      vi.advanceTimersByTime(180);
    });

    expect(document.activeElement).toBe(input);
    expect(surface().className).toContain("dock-open");
  });

  it("keeps the tray open while the project combobox is focused", async () => {
    vi.useFakeTimers();
    await loadApp();

    const sidecar = screen.getByLabelText("Pin It sidecar");
    const projectInput = screen.getByLabelText("Project or artifact");
    const surface = () => document.querySelector(".surface");

    await act(async () => {
      fireEvent.mouseEnter(sidecar);
      vi.advanceTimersByTime(100);
    });

    expect(surface().className).toContain("capture-open");

    await act(async () => {
      projectInput.focus();
      fireEvent.change(projectInput, { target: { value: "world model" } });
      fireEvent.mouseLeave(sidecar);
      vi.advanceTimersByTime(2500);
    });

    expect(surface().className).toContain("capture-open");

    await act(async () => {
      projectInput.blur();
      fireEvent.blur(sidecar, { relatedTarget: document.body });
      vi.advanceTimersByTime(2500);
    });

    await act(async () => {
      vi.advanceTimersByTime(180);
    });

    expect(surface().className).toContain("dock-open");
  });

  it("auto-collapses after selecting a project option with the mouse", async () => {
    vi.useFakeTimers();
    await loadApp();

    const sidecar = screen.getByLabelText("Pin It sidecar");
    const projectInput = screen.getByLabelText("Project or artifact");
    const surface = () => document.querySelector(".surface");

    await act(async () => {
      fireEvent.mouseEnter(sidecar);
      vi.advanceTimersByTime(100);
    });

    expect(surface().className).toContain("capture-open");

    await act(async () => {
      fireEvent.focus(projectInput);
    });
    const currentProjectOption = screen.getByRole("option", { name: "Untitled artifact" });

    await act(async () => {
      fireEvent.mouseLeave(sidecar);
      fireEvent.mouseDown(currentProjectOption);
      fireEvent.click(currentProjectOption);
      vi.advanceTimersByTime(2500);
    });

    await act(async () => {
      vi.advanceTimersByTime(180);
    });

    expect(document.activeElement).not.toBe(projectInput);
    expect(surface().className).toContain("dock-open");
  });
});
