import React from "react";
import { CheckCircle, Kanban, PushPin } from "@phosphor-icons/react";
import { Button } from "../components/ui/button.jsx";
import { Combobox } from "../components/ui/combobox.jsx";
import { Textarea } from "../components/ui/textarea.jsx";

export function SidecarDock({
  dockCaptureNotice,
  draftContent,
  isClosing,
  isOpen,
  justSaved,
  onBlur,
  onDockClick,
  onDockPointerCancel,
  onDockPointerDown,
  onDockPointerMove,
  onDockPointerUp,
  onDraftChange,
  onDraftKeyDown,
  onFocus,
  onMouseEnter,
  onMouseLeave,
  onOpenBoard,
  onPaste,
  onProjectCommit,
  onProjectDraft,
  onTrayFocus,
  onTrayPointerDown,
  pinCount,
  projectList,
  projectName,
  rootRef,
  side
}) {
  return (
    <aside
      ref={rootRef}
      className={`floating-sidecar sidecar-${side === "left" ? "left" : "right"} ${isOpen ? "is-open" : ""} ${isClosing ? "is-closing" : ""}`}
      aria-label="Pin It sidecar"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onFocus={onFocus}
      onBlur={onBlur}
    >
      <Button
        type="button"
        variant="ghost"
        className="dock-tab"
        aria-label="Open Pin It"
        onPointerDown={onDockPointerDown}
        onPointerMove={onDockPointerMove}
        onPointerUp={onDockPointerUp}
        onPointerCancel={onDockPointerCancel}
        onClick={onDockClick}
      >
        <PushPin className="dock-pin" weight="fill" aria-hidden="true" />
        <strong aria-label={`${pinCount} saved snippets`}>{pinCount}</strong>
      </Button>

      {dockCaptureNotice ? (
        <div className="dock-capture-check" role="status" aria-live="polite" aria-label={dockCaptureNotice}>
          <CheckCircle weight="fill" aria-hidden="true" />
        </div>
      ) : null}

      <section className="capture-tray" aria-label="Capture tray" onPointerDown={onTrayPointerDown} onFocus={onTrayFocus}>
        <div className="tray-head">
          <label className="project-field">
            <span className="sr-only">Project or artifact</span>
            <Combobox
              inputClassName="project-name"
              label="Project or artifact"
              menuLabel="Saved projects"
              options={projectList}
              value={projectName}
              onChange={onProjectDraft}
              onCommit={onProjectCommit}
            />
          </label>
          <Button
            type="button"
            variant="primary"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={onOpenBoard}
          >
            <Kanban aria-hidden="true" />
            Board
          </Button>
        </div>

        <Textarea
          className="quick-capture"
          aria-label="Capture content"
          placeholder="Paste something worth pinning..."
          value={draftContent}
          onChange={(event) => onDraftChange(event.target.value)}
          onPaste={onPaste}
          onKeyDown={onDraftKeyDown}
        />
        <div className="capture-foot">
          <span className={`saved-state ${justSaved ? "is-visible" : ""}`} aria-label={justSaved ? "Saved" : undefined}>
            {justSaved ? <CheckCircle weight="fill" aria-hidden="true" /> : `${pinCount} pinned`}
          </span>
        </div>
      </section>
    </aside>
  );
}
