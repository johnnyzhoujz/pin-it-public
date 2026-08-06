import React, { useEffect, useRef, useState } from "react";
import {
  Archive,
  ArrowCounterClockwise,
  Check,
  Code,
  Copy,
  FileText,
  Image as ImageIcon,
  Minus,
  GearSix,
  Trash,
  X
} from "@phosphor-icons/react";
import { detectContentType, normalizeProjectName, snippetsForProject } from "../packet.js";
import { renderMarkdown } from "../markdown.js";
import { filterBoardSnippets, nextSpatialFocusIndex } from "./boardModel.js";
import { Badge } from "../components/ui/badge.jsx";
import { Button } from "../components/ui/button.jsx";
import { Input } from "../components/ui/input.jsx";
import { Textarea } from "../components/ui/textarea.jsx";
import screenRecordingPromptImage from "../assets/onboarding/screen-recording-prompt.png";
import screenRecordingToggleImage from "../assets/onboarding/screen-recording-toggle.png";

export function BuildMode({
  copied,
  currentProject,
  buildPacket,
  projectList,
  selectedIds,
  selectedSet,
  allSnippets,
  archivedSnippets,
  snippets,
  nativeState,
  screenshotOnboarding,
  onArchive,
  onCopy,
  onDelete,
  onDeleteProject,
  onCloseBuild,
  onOpenDetail,
  onOpenSettings,
  onProject,
  onReorder,
  onRestore,
  onDeselectAll,
  onSelectAll,
  onSelected,
  onDismissScreenshotOnboarding,
  onStartScreenshotOnboarding
}) {
  const allSelected = snippets.length > 0 && selectedIds.length === snippets.length;
  const [projectDeleteTarget, setProjectDeleteTarget] = useState("");
  const [boardQuery, setBoardQuery] = useState("");
  const [draggedPinId, setDraggedPinId] = useState("");
  const searchInputRef = useRef(null);
  const pinRefs = useRef(new Map());
  const visibleSnippets = filterBoardSnippets(snippets, boardQuery);
  const dragDisabled = Boolean(boardQuery.trim());

  function handleProjectDeleteConfirm() {
    const project = normalizeProjectName(projectDeleteTarget);
    if (!project) {
      setProjectDeleteTarget("");
      return;
    }

    setProjectDeleteTarget("");
    onDeleteProject(project);
  }

  function focusPin(index) {
    const nextIndex = Math.max(0, Math.min(index, visibleSnippets.length - 1));
    const pin = visibleSnippets[nextIndex];
    if (!pin) {
      return;
    }

    pinRefs.current.get(pin.id)?.focus();
  }

  function pinRects() {
    return visibleSnippets
      .map((snippet, index) => {
        const node = pinRefs.current.get(snippet.id);
        if (!node) {
          return null;
        }

        const rect = node.getBoundingClientRect();
        return {
          index,
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom
        };
      })
      .filter(Boolean);
  }

  function handleSearchKeyDown(event) {
    if ((event.key === "ArrowDown" || event.key === "Escape") && visibleSnippets.length) {
      event.preventDefault();
      focusPin(0);
    }
  }

  function handleBoardKeyDown(event) {
    const target = event.target.closest("[data-pin-id]");
    if (!target) {
      return;
    }

    const pinId = target.dataset.pinId;
    const index = visibleSnippets.findIndex((snippet) => snippet.id === pinId);
    if (index < 0) {
      return;
    }

    if (["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft"].includes(event.key)) {
      event.preventDefault();
      focusPin(nextSpatialFocusIndex({ currentIndex: index, key: event.key, rects: pinRects(), count: visibleSnippets.length }));
      return;
    }

    if (event.key === "Enter" && event.metaKey) {
      event.preventDefault();
      onOpenDetail(pinId);
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      const selected = new Set(selectedIds);
      if (selected.has(pinId)) {
        selected.delete(pinId);
      } else {
        selected.add(pinId);
      }
      onSelected([...selected]);
      return;
    }

    if (event.key.toLowerCase() === "e") {
      event.preventDefault();
      onOpenDetail(pinId);
      return;
    }

    if (event.key === "Backspace") {
      event.preventDefault();
      onArchive(pinId);
      return;
    }

    if (event.key === "/") {
      event.preventDefault();
      searchInputRef.current?.focus();
    }
  }

  return (
    <section className="build-panel" aria-label="Build mode">
      <header className="build-head">
        <div>
          <h1>{currentProject}</h1>
          <p>
            {selectedIds.length} of {snippets.length} {snippets.length === 1 ? "pin" : "pins"} selected.
          </p>
        </div>
        <div className="build-actions">
          <Button type="button" variant="ghost" onClick={onOpenSettings}>
            <GearSix aria-hidden="true" />
            Settings
          </Button>
          {nativeState.available ? (
            <Button type="button" variant="ghost" size="icon" onClick={onCloseBuild} aria-label="Collapse Pin It">
              <X aria-hidden="true" />
            </Button>
          ) : null}
        </div>
      </header>

      <div className="build-body">
        <nav className="project-rail" aria-label="Projects">
          {projectList.map((name) => (
            <ProjectRow
              key={name}
              name={name}
              count={snippetsForProject(allSnippets, name).length}
              active={normalizeProjectName(name) === currentProject}
              actionLabel={`${name} project actions`}
              onOpen={() => onProject(name)}
              actions={
                <Button
                  type="button"
                  variant="dangerGhost"
                  size="icon-sm"
                  onClick={() => setProjectDeleteTarget(name)}
                  aria-label={`Delete ${name}`}
                >
                  <Trash aria-hidden="true" />
                </Button>
              }
            />
          ))}

          {archivedSnippets.length ? (
            <details className="rail-archive" aria-label="Archived pins">
              <summary className="archive-head">
                <strong>Archived</strong>
                <span>{archivedSnippets.length}</span>
              </summary>
              <div className="archive-list">
                {archivedSnippets.map((snippet) => (
                  <article className="archive-item" key={snippet.id}>
                    <button type="button" onClick={() => onOpenDetail(snippet.id)}>
                      <span>{snippet.title || "Untitled pin"}</span>
                    </button>
                    <div className="archive-actions">
                      <Button type="button" variant="ghost" size="icon-sm" onClick={() => onRestore(snippet.id)} aria-label="Restore archived pin">
                        <ArrowCounterClockwise aria-hidden="true" />
                      </Button>
                      <Button type="button" variant="dangerGhost" size="icon-sm" onClick={() => onDelete(snippet.id)} aria-label="Delete archived pin">
                        <Trash aria-hidden="true" />
                      </Button>
                    </div>
                  </article>
                ))}
              </div>
            </details>
          ) : null}
        </nav>

        <section className="board-panel" aria-label="Kept material">
          <div className="board-toolbar">
            <div className="board-heading">
              <strong>Sticky board</strong>
            </div>
            <Input
              ref={searchInputRef}
              className="board-search"
              aria-label="Search pins"
              placeholder="Search pins"
              value={boardQuery}
              onChange={(event) => setBoardQuery(event.target.value)}
              onKeyDown={handleSearchKeyDown}
            />
            <div className="board-actions">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={allSelected ? onDeselectAll : onSelectAll}
                disabled={!snippets.length}
              >
                {allSelected ? <Minus aria-hidden="true" /> : <Check aria-hidden="true" />}
                {allSelected ? "Deselect all" : "Select all"}
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() => onCopy(buildPacket, "packet")}
                disabled={!selectedIds.length}
              >
                <Copy aria-hidden="true" />
                {copied === "packet" ? "Copied" : "Copy selected"}
              </Button>
            </div>
          </div>

          <div className="sticky-board" onKeyDown={handleBoardKeyDown}>
            {visibleSnippets.length ? (
              visibleSnippets.map((snippet, index) => (
                <StickyNote
                  key={snippet.id}
                  copied={copied}
                  dragDisabled={dragDisabled}
                  index={index}
                  refCallback={(node) => {
                    if (node) {
                      pinRefs.current.set(snippet.id, node);
                    } else {
                      pinRefs.current.delete(snippet.id);
                    }
                  }}
                  selected={selectedSet.has(snippet.id)}
                  snippet={snippet}
                  onArchive={onArchive}
                  onCopy={onCopy}
                  onDelete={onDelete}
                  onDragStart={(id) => setDraggedPinId(id)}
                  onDrop={(targetId) => {
                    if (draggedPinId && draggedPinId !== targetId) {
                      onReorder(draggedPinId, targetId);
                    }
                    setDraggedPinId("");
                  }}
                  onOpenDetail={onOpenDetail}
                  onToggle={(id, checked) => {
                    const selected = new Set(selectedIds);
                    if (checked) {
                      selected.add(id);
                    } else {
                      selected.delete(id);
                    }
                    onSelected([...selected]);
                  }}
                />
              ))
            ) : (
              <EmptyBoard query={boardQuery} shortcutLabel={nativeState.shortcutLabel} />
            )}
          </div>
        </section>

      </div>

      {projectDeleteTarget ? (
        <ProjectDeleteDialog
          count={countProjectPins(allSnippets, projectDeleteTarget)}
          name={projectDeleteTarget}
          onCancel={() => setProjectDeleteTarget("")}
          onConfirm={handleProjectDeleteConfirm}
        />
      ) : null}

      {screenshotOnboarding ? (
        <ScreenshotOnboardingDialog
          shortcutLabel={screenshotOnboarding.shortcutLabel}
          onDismiss={onDismissScreenshotOnboarding}
          onStart={onStartScreenshotOnboarding}
        />
      ) : null}
    </section>
  );
}

function ProjectRow({ active = false, actionLabel, actions, count, name, onOpen }) {
  return (
    <article className={`project-row ${active ? "active" : ""}`}>
      <button className="project-pill" type="button" onClick={onOpen}>
        <span>{name}</span>
        <strong>{count}</strong>
      </button>
      <div className="project-row-actions" aria-label={actionLabel}>
        {actions}
      </div>
    </article>
  );
}

function ProjectDeleteDialog({ count, name, onCancel, onConfirm }) {
  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      }
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [onCancel]);

  return (
    <div className="confirm-modal" role="presentation" onMouseDown={onCancel}>
      <section
        className="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-project-title"
        aria-describedby="delete-project-description"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="confirm-copy">
          <h2 id="delete-project-title">Delete project?</h2>
          <p id="delete-project-description">
            This will permanently delete "{name}" and {count} {count === 1 ? "pin" : "pins"}. This cannot be undone.
          </p>
        </div>
        <div className="confirm-actions">
          <Button type="button" variant="ghost" onClick={onCancel} autoFocus>
            Cancel
          </Button>
          <Button type="button" variant="danger" onClick={onConfirm}>
            Delete
          </Button>
        </div>
      </section>
    </div>
  );
}

function ScreenshotOnboardingDialog({ shortcutLabel = "Command+Shift+O", onDismiss, onStart }) {
  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        onDismiss?.();
      }
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [onDismiss]);

  return (
    <div className="onboarding-modal" role="presentation" onMouseDown={() => onDismiss?.()}>
      <section
        className="onboarding-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="screenshot-onboarding-title"
        aria-describedby="screenshot-onboarding-description"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="onboarding-copy">
          <h2 id="screenshot-onboarding-title">Pin anything you see on the screen.</h2>
          <p id="screenshot-onboarding-description">
            MacOS may ask for Screen Recording access. Follow these two steps, then use the shortcut below.
          </p>
        </div>
        <ol className="permission-preview" aria-label="MacOS Screen Recording permission guide">
          <li className="permission-step">
            <span className="permission-step-number" aria-hidden="true">1</span>
            <figure className="permission-shot permission-shot-prompt">
              <img src={screenRecordingPromptImage} alt="MacOS Screen Recording prompt for Pin It" />
              <figcaption>Click Open System Settings</figcaption>
            </figure>
          </li>
          <li className="permission-step">
            <span className="permission-step-number" aria-hidden="true">2</span>
            <figure className="permission-shot permission-shot-toggle">
              <img src={screenRecordingToggleImage} alt="Pin It toggle in Screen Recording settings" />
              <figcaption>Turn on Pin It</figcaption>
            </figure>
          </li>
        </ol>
        <div className="onboarding-shortcut">
          <HotkeyChord label={shortcutLabel} />
          <span>Capture screen region</span>
        </div>
        <div className="onboarding-actions">
          <Button type="button" variant="ghost" onClick={onDismiss}>
            Got it
          </Button>
          <Button type="button" variant="primary" onClick={onStart} autoFocus>
            Start capture
          </Button>
        </div>
      </section>
    </div>
  );
}

function StickyNote({
  copied,
  dragDisabled,
  index,
  refCallback,
  selected,
  snippet,
  onArchive,
  onCopy,
  onDelete,
  onDragStart,
  onDrop,
  onOpenDetail,
  onToggle
}) {
  const TypeIcon = typeIconForSnippet(snippet);

  return (
    <article
      className={`sticky-note ${selected ? "selected" : ""}`}
      data-pin-id={snippet.id}
      draggable={!dragDisabled}
      ref={refCallback}
      tabIndex={0}
      onDragStart={(event) => {
        if (dragDisabled) {
          event.preventDefault();
          return;
        }
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", snippet.id);
        onDragStart(snippet.id);
      }}
      onDragOver={(event) => {
        if (!dragDisabled) {
          event.preventDefault();
        }
      }}
      onDrop={(event) => {
        event.preventDefault();
        onDrop(snippet.id);
      }}
      onClick={(event) => {
        if (event.target.closest("button") || event.target.closest("input") || event.target.closest("label")) {
          return;
        }
        onOpenDetail(snippet.id);
      }}
    >
      <div className="sticky-actions" aria-label="Sticky actions">
        <Button type="button" variant="ghost" size="icon-sm" onClick={() => onCopy(snippet.content || "", snippet.id)} aria-label="Copy pin">
          <Copy aria-hidden="true" />
        </Button>
        <Button type="button" variant="ghost" size="icon-sm" onClick={() => onArchive(snippet.id)} aria-label="Archive pin">
          <Archive aria-hidden="true" />
        </Button>
        <Button type="button" variant="dangerGhost" size="icon-sm" onClick={() => onDelete(snippet.id)} aria-label="Delete pin">
          <Trash aria-hidden="true" />
        </Button>
      </div>
      <label className="select-line">
        <input type="checkbox" checked={selected} onChange={(event) => onToggle(snippet.id, event.target.checked)} />
        <TypeIcon className="type-icon" weight={selected ? "fill" : "regular"} aria-hidden="true" />
        <span>{snippet.title}</span>
      </label>
      <MarkdownPreview className="sticky-preview" content={snippet.content} clipboardFormats={snippet.clipboardFormats} />
      {copied === snippet.id ? <span className="sticky-copied">Copied</span> : null}
    </article>
  );
}

export function NoteDetail({ copied, snippet, onClose, onCopy, onNavigate, onSave }) {
  const contentType = snippet.contentType || detectContentType(snippet.content);
  const capturedAt = formatKeepDate(snippet.createdAt, { includeTime: true });
  const dialogRef = useRef(null);
  const contentEditorRef = useRef(null);
  const committedDraftRef = useRef({
    content: snippet.content || "",
    id: snippet.id,
    title: snippet.title || "Untitled pin"
  });
  const [titleDraft, setTitleDraft] = useState(snippet.title || "Untitled pin");
  const [contentDraft, setContentDraft] = useState(snippet.content || "");
  const [isContentEditing, setIsContentEditing] = useState(false);

  useEffect(() => {
    const nextTitle = snippet.title || "Untitled pin";
    const nextContent = snippet.content || "";
    committedDraftRef.current = { content: nextContent, id: snippet.id, title: nextTitle };
    setTitleDraft(nextTitle);
    setContentDraft(nextContent);
    setIsContentEditing(false);
    dialogRef.current?.focus();
  }, [snippet.id, snippet.title, snippet.content]);

  useEffect(() => {
    if (isContentEditing) {
      contentEditorRef.current?.focus();
    }
  }, [isContentEditing]);

  function handleDetailKeyDown(event) {
    if (!["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft"].includes(event.key) || isEditablePasteTarget(event.target)) {
      return;
    }

    const nextPinId = nextVisiblePinIdFromDom(snippet.id, event.key);
    if (!nextPinId || nextPinId === snippet.id) {
      return;
    }

    event.preventDefault();
    commitDrafts();
    onNavigate(nextPinId);
  }

  function handleContentPreviewKeyDown(event) {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    setIsContentEditing(true);
  }

  function hasDraftChanges() {
    const committed = committedDraftRef.current;
    return committed.id !== snippet.id || titleDraft !== committed.title || contentDraft !== committed.content;
  }

  function commitDrafts() {
    if (hasDraftChanges()) {
      committedDraftRef.current = { content: contentDraft, id: snippet.id, title: titleDraft };
      onSave(snippet.id, { title: titleDraft, content: contentDraft });
    }
  }

  function closeDetail() {
    commitDrafts();
    onClose();
  }

  return (
    <section className="note-modal" aria-label="Full pin" onClick={(event) => event.target === event.currentTarget && closeDetail()}>
      <div className="note-dialog" ref={dialogRef} tabIndex={-1} onKeyDown={handleDetailKeyDown}>
        <header className="note-dialog-head">
          <div className="note-dialog-meta">
            <Badge>{contentType}</Badge>
            <Input
              className="note-title-input"
              aria-label="Pin title"
              value={titleDraft}
              onChange={(event) => setTitleDraft(event.target.value)}
              onBlur={commitDrafts}
            />
            <span>{capturedAt}</span>
          </div>
          <div className="note-dialog-actions">
            <Button type="button" variant="secondary" onClick={() => onCopy(contentDraft || "", snippet.id)}>
              <Copy aria-hidden="true" />
              {copied === snippet.id ? "Copied" : "Copy"}
            </Button>
            <Button type="button" variant="ghost" size="icon" onClick={closeDetail} aria-label="Close full pin">
              <X aria-hidden="true" />
            </Button>
          </div>
        </header>
        {isContentEditing ? (
          <Textarea
            ref={contentEditorRef}
            className="note-full note-content-editor"
            aria-label="Pin content"
            value={contentDraft}
            onBlur={() => {
              commitDrafts();
              setIsContentEditing(false);
            }}
            onChange={(event) => setContentDraft(event.target.value)}
          />
        ) : (
          <div
            className="note-content-surface"
            role="button"
            tabIndex={0}
            aria-label="Edit pin content"
            onClick={() => setIsContentEditing(true)}
            onKeyDown={handleContentPreviewKeyDown}
          >
            <MarkdownPreview className="note-full note-reader" content={contentDraft} clipboardFormats={snippet.clipboardFormats} />
          </div>
        )}
      </div>
    </section>
  );
}

function MarkdownPreview({ className = "", clipboardFormats, content }) {
  return (
    <div
      className={`markdown-preview ${className}`}
      dangerouslySetInnerHTML={{ __html: renderMarkdown(content, { clipboardFormats }) }}
    />
  );
}

function nextVisiblePinIdFromDom(currentId, key) {
  if (typeof document === "undefined") {
    return currentId;
  }

  const elements = [...document.querySelectorAll(".sticky-board [data-pin-id]")];
  const currentIndex = elements.findIndex((element) => element.dataset.pinId === currentId);
  if (currentIndex < 0) {
    return currentId;
  }

  const rects = elements.map((element, index) => {
    const rect = element.getBoundingClientRect();
    return {
      index,
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom
    };
  });
  const nextIndex = nextSpatialFocusIndex({ currentIndex, key, rects, count: elements.length });
  return elements[nextIndex]?.dataset.pinId || currentId;
}

function EmptyBoard({ query = "", shortcutLabel = "Command+Shift+I / Command+Shift+O" }) {
  const hasQuery = Boolean(query.trim());
  const [captureShortcut = "Command+Shift+I", regionShortcut = "Command+Shift+O"] = shortcutLabel
    .split("/")
    .map((label) => label.trim())
    .filter(Boolean);

  return (
    <div className="empty-state">
      <h2>{hasQuery ? "No pins match" : "No pins yet"}</h2>
      {hasQuery ? <p>Clear search to return to the full board.</p> : null}
      {!hasQuery ? (
        <>
          <article className="sample-sticky" aria-label="Sample pin preview">
            <div className="sample-sticky-actions" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <div className="sample-sticky-title">
              <span className="sample-checkbox" aria-hidden="true" />
              <FileText className="type-icon" aria-hidden="true" />
              <strong>Sample pin</strong>
            </div>
            <p>Accepted explanation, useful error state, or snippet you want the next AI to remember.</p>
          </article>
          <div className="empty-shortcuts" aria-label="Capture shortcuts">
            <div>
              <HotkeyChord label={captureShortcut} />
              <span>Capture selection or clipboard</span>
            </div>
            {regionShortcut ? (
              <div>
                <HotkeyChord label={regionShortcut} />
                <span>Capture screen region</span>
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}

function HotkeyChord({ label }) {
  const keys = label
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => (part === "Command" ? "Cmd" : part));

  return (
    <span className="hotkey-chord" aria-label={label}>
      {keys.map((key, index) => (
        <React.Fragment key={`${label}-${key}-${index}`}>
          {index > 0 ? (
            <span className="hotkey-plus" aria-hidden="true">
              +
            </span>
          ) : null}
          <kbd>{key}</kbd>
        </React.Fragment>
      ))}
    </span>
  );
}

function countProjectPins(snippets, projectName) {
  const project = normalizeProjectName(projectName);
  return snippets.filter((snippet) => normalizeProjectName(snippet.projectName) === project).length;
}

function formatKeepDate(value, { includeTime = false } = {}) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    ...(includeTime
      ? {
          hour: "numeric",
          minute: "2-digit"
        }
      : {})
  });
}

function typeIconForSnippet(snippet) {
  const type = snippet.contentType || detectContentType(snippet.content);
  if (type === "Image") {
    return ImageIcon;
  }
  if (type === "Code") {
    return Code;
  }
  return FileText;
}

function isEditablePasteTarget(target) {
  return Boolean(target?.closest?.('textarea, input, [contenteditable="true"]'));
}
