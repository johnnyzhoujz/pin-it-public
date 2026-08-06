import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BuildMode, NoteDetail } from "../src/board/BuildMode.jsx";

globalThis.React = React;

const baseBuildProps = {
  copied: null,
  currentProject: "Deck",
  buildPacket: "",
  projectList: ["Deck"],
  selectedIds: [],
  selectedSet: new Set(),
  allSnippets: [],
  archivedSnippets: [],
  snippets: [],
  nativeState: { available: true, shortcutLabel: "Command+Shift+I / Command+Shift+O" },
  onArchive: vi.fn(),
  onCopy: vi.fn(),
  onDelete: vi.fn(),
  onDeleteProject: vi.fn(),
  onCloseBuild: vi.fn(),
  onOpenDetail: vi.fn(),
  onOpenSettings: vi.fn(),
  onProject: vi.fn(),
  onReorder: vi.fn(),
  onRestore: vi.fn(),
  onDeselectAll: vi.fn(),
  onSelectAll: vi.fn(),
  onSelected: vi.fn()
};

describe("board UI regressions", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  it("shows a sample pin and capture hotkeys in the empty board state", () => {
    const { container } = render(<BuildMode {...baseBuildProps} />);

    expect(screen.queryByRole("button", { name: "Dock" })).toBeNull();
    expect(screen.getByText("Sticky board")).toBeTruthy();
    expect(screen.queryByText("Pick the material you want to carry back into another AI tool.")).toBeNull();
    expect(container.querySelector(".board-toolbar > .board-search")).toBeTruthy();
    expect(container.querySelector(".board-actions .board-search")).toBeNull();
    expect(screen.getByLabelText("Sample pin preview")).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: /pin anything you see on the screen/i })).toBeNull();
    expect(container.querySelector(".empty-state > svg")).toBeNull();
    expect(screen.queryByText("Switch to Play and paste the first useful snippet under this artifact.")).toBeNull();
    expect(screen.getByLabelText("Command+Shift+I")).toBeTruthy();
    expect(screen.getByLabelText("Command+Shift+I").querySelectorAll("kbd")).toHaveLength(3);
    expect(screen.getByLabelText("Command+Shift+I").textContent).toBe("Cmd+Shift+I");
    expect(screen.getByText("Capture selection or clipboard")).toBeTruthy();
    expect(screen.getByLabelText("Command+Shift+O")).toBeTruthy();
    expect(screen.getByLabelText("Command+Shift+O").querySelectorAll("kbd")).toHaveLength(3);
    expect(screen.getByLabelText("Command+Shift+O").textContent).toBe("Cmd+Shift+O");
    expect(screen.getByText("Capture screen region")).toBeTruthy();
  });

  it("disables packet copying when the user explicitly deselects every pin", () => {
    render(
      <BuildMode
        {...baseBuildProps}
        selectedIds={[]}
        selectedSet={new Set()}
        snippets={[
          {
            id: "first-pin",
            title: "Useful selection",
            content: "A useful saved snippet",
            contentType: "Text",
            projectName: "Deck",
            order: 0,
            createdAt: "2026-06-12T12:00:00.000Z"
          }
        ]}
      />
    );

    expect(screen.getByText("0 of 1 pin selected.")).toBeTruthy();
    expect(screen.getByRole("button", { name: /copy selected/i }).disabled).toBe(true);
  });

  it("shows the screenshot onboarding lesson after the first pin reaches the board", () => {
    const onDismiss = vi.fn();
    const onStart = vi.fn();
    render(
      <BuildMode
        {...baseBuildProps}
        selectedIds={["first-pin"]}
        selectedSet={new Set(["first-pin"])}
        snippets={[
          {
            id: "first-pin",
            title: "Useful selection",
            content: "A useful saved snippet",
            contentType: "Text",
            projectName: "Deck",
            order: 0,
            createdAt: "2026-06-12T12:00:00.000Z"
          }
        ]}
        screenshotOnboarding={{ shortcutLabel: "Command+Shift+O" }}
        onDismissScreenshotOnboarding={onDismiss}
        onStartScreenshotOnboarding={onStart}
      />
    );

    expect(screen.getByRole("dialog", { name: /pin anything you see on the screen/i })).toBeTruthy();
    expect(screen.getByLabelText("Command+Shift+O").textContent).toBe("Cmd+Shift+O");
    expect(screen.getByText(/MacOS may ask for Screen Recording access/i)).toBeTruthy();
    expect(screen.getByLabelText("MacOS Screen Recording permission guide")).toBeTruthy();
    expect(screen.getByText("Click Open System Settings")).toBeTruthy();
    expect(screen.getByText("Turn on Pin It")).toBeTruthy();
    expect(screen.getByAltText("MacOS Screen Recording prompt for Pin It")).toBeTruthy();
    expect(screen.getByAltText("Pin It toggle in Screen Recording settings")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /start capture/i }));
    expect(onStart).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: /got it/i }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("renders expanded markdown tables by default and edits raw markdown on click", () => {
    const onSave = vi.fn();
    const { container } = render(
      <NoteDetail
        copied={null}
        snippet={{
          id: "table-pin",
          title: "Useful table",
          content: "| Signal | Evidence |\n| --- | --- |\n| Adoption | Measured |",
          contentType: "Markdown",
          createdAt: "2026-06-12T12:00:00.000Z"
        }}
        onClose={vi.fn()}
        onCopy={vi.fn()}
        onNavigate={vi.fn()}
        onSave={onSave}
      />
    );

    expect(screen.queryByRole("button", { name: /^save$/i })).toBeNull();
    expect(container.querySelector(".note-reader table")).toBeTruthy();
    expect(screen.queryByLabelText("Pin content")).toBeNull();

    fireEvent.click(screen.getByLabelText("Edit pin content"));

    const editor = screen.getByLabelText("Pin content");
    expect(editor.value).toContain("| Signal | Evidence |");
    expect(container.querySelector(".note-reader")).toBeNull();

    fireEvent.change(editor, { target: { value: "| Signal | Evidence |\n| --- | --- |\n| Adoption | Verified |" } });
    fireEvent.blur(editor);

    expect(onSave).toHaveBeenCalledWith("table-pin", {
      title: "Useful table",
      content: "| Signal | Evidence |\n| --- | --- |\n| Adoption | Verified |"
    });
    expect(container.querySelector(".note-reader table")).toBeTruthy();
    expect(screen.queryByLabelText("Pin content")).toBeNull();
  });

  it("autosaves expanded title edits on blur and closes without a Save action", () => {
    const onClose = vi.fn();
    const onSave = vi.fn();
    render(
      <NoteDetail
        copied={null}
        snippet={{
          id: "title-pin",
          title: "Fallback title",
          content: "A useful saved snippet",
          contentType: "Text",
          createdAt: "2026-06-12T12:00:00.000Z"
        }}
        onClose={onClose}
        onCopy={vi.fn()}
        onNavigate={vi.fn()}
        onSave={onSave}
      />
    );

    const title = screen.getByLabelText("Pin title");
    fireEvent.change(title, { target: { value: "Sharper title" } });
    fireEvent.blur(title);
    fireEvent.click(screen.getByLabelText("Close full pin"));

    expect(screen.queryByRole("button", { name: /^save$/i })).toBeNull();
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith("title-pin", {
      title: "Sharper title",
      content: "A useful saved snippet"
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders image pins by default without opening the raw editor", () => {
    const { container } = render(
      <NoteDetail
        copied={null}
        snippet={{
          id: "image-pin",
          title: "Clipboard image",
          content: "![Clipboard image](data:image/png;base64,AAAA)",
          contentType: "Image",
          imagePath: "images/image-pin.png",
          createdAt: "2026-06-12T12:00:00.000Z"
        }}
        onClose={vi.fn()}
        onCopy={vi.fn()}
        onNavigate={vi.fn()}
        onSave={vi.fn()}
      />
    );

    expect(screen.queryByLabelText("Pin content")).toBeNull();
    expect(container.querySelector(".note-reader img")).toBeTruthy();
  });
});
