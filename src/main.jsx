import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Copy, IconContext } from "@phosphor-icons/react";
import "./styles.css";
import {
  createSnippet,
  archivedSnippetsForProject,
  detectContentType,
  generateBuildPacket,
  normalizeProjectName,
  projectNames,
  snippetsForProject
} from "./packet.js";
import { playCaptureSound } from "./audio/captureSound.js";
import { editPin, reorderProjectSnippets } from "./board/boardModel.js";
import { BuildMode, NoteDetail } from "./board/BuildMode.jsx";
import { Button } from "./components/ui/button.jsx";
import { SettingsDialog } from "./settings/SettingsDialog.jsx";
import { useSystemTheme } from "./hooks/useSystemTheme.js";
import {
  createFileBackedImageCapturePayload,
  imageDataUrlFromCapturePayload,
  imageDataUrlFromMarkdown
} from "./sidecar/captureModel.js";
import { SidecarDock } from "./sidecar/SidecarDock.jsx";
import { isCaptureSuccessNotice } from "./sidecar/sidecarModel.js";
import { normalizeThemePreference } from "./settings/settingsModel.js";
import { excerptForSmartTitle, shouldApplyGeneratedTitle } from "./titles/smartTitles.js";
import {
  durableStateSignature,
  loadStoredState,
  parseImportedState,
  saveStoredState,
  serializeExportPayload
} from "./storage.js";
import {
  captureNativeClipboard,
  captureNativeScreenshotRegion,
  clearNativeOpenAIApiKey,
  completeNativeOnboardingStep,
  completeNativeStorageCutover,
  copyNativePinImage,
  isElectronRuntime,
  moveNativeWindowBy,
  openNativeUrl,
  readNativePinImageDataUrl,
  readNativeStore,
  refreshNativeOpenAIApiKeyStatus,
  saveNativeOpenAIApiKey,
  setNativeWindowMode,
  setupNativeBridge,
  showNativeWindow,
  snapNativeWindowToSide,
  generateNativePinTitle,
  writeNativeStore,
  writeNativeClipboard,
  writeNativePinImage
} from "./native.js";

const TRAY_CLOSE_DELAY_MS = 2000;
const TRAY_EXIT_MS = 180;
const ONBOARDING_BOARD_OPEN_DELAY_MS = 1000;

const defaultState = {
  projectName: "Untitled artifact",
  view: "play",
  panelOpen: false,
  draftContent: "",
  justSaved: false,
  copied: null,
  metaPrompt: "",
  metaPromptsByProject: {},
  projects: {},
  soundMuted: false,
  smartTitlesEnabled: false,
  detailId: null,
  themePreference: "system",
  selectedIdsByProject: {},
  snippets: []
};

function wait(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function App() {
  const [state, setState] = useState(() => loadStoredState(defaultState));
  const lastPersistedSignatureRef = useRef(durableStateSignature(state));
  const systemTheme = useSystemTheme();
  const [nativeState, setNativeState] = useState({
    available: false,
    shortcutLabel: "Command+Shift+I",
    status: "Web preview",
    sidecarSide: "right",
    ai: { provider: "openai", configured: false, model: "gpt-5.6-luna" }
  });
  const nativeStateRef = useRef(nativeState);
  const [onboarding, setOnboarding] = useState({
    clipboardLessonComplete: true,
    screenshotLessonComplete: true
  });
  const onboardingRef = useRef(onboarding);
  const pendingSmartTitleIdsRef = useRef(new Set());
  const [nativeNotice, setNativeNotice] = useState("");
  const [updateAvailable, setUpdateAvailable] = useState(null);
  const [aiSaving, setAiSaving] = useState(false);
  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [trayClosing, setTrayClosing] = useState(false);
  const stateRef = useRef(state);
  const closeTimerRef = useRef(null);
  const closeTimerDraftRef = useRef("");
  const closeTimerCommitsWhileFocusedRef = useRef(false);
  const sidecarRootRef = useRef(null);
  const hoverOpenTimerRef = useRef(null);
  const hoverBlockedUntilRef = useRef(0);
  const trayExitTimerRef = useRef(null);
  const sidecarDragRef = useRef({
    active: false,
    lastX: 0,
    lastY: 0,
    moved: false,
    suppressClick: false
  });

  const currentProject = normalizeProjectName(state.projectName);
  const snippets = useMemo(() => snippetsForProject(state.snippets, currentProject), [state.snippets, currentProject]);
  const archivedSnippets = useMemo(
    () => archivedSnippetsForProject(state.snippets, currentProject),
    [state.snippets, currentProject]
  );
  const projectList = useMemo(
    () => projectNames(state.snippets, currentProject, state.projects),
    [state.snippets, currentProject, state.projects]
  );
  const selectedIds = currentSelectedIds(state, snippets, currentProject);
  const selectedSet = new Set(selectedIds);
  const isBuild = state.view === "build";
  const activeTheme = state.themePreference === "system" ? systemTheme : state.themePreference;
  const trayExpanded = state.panelOpen || trayClosing;
  const buildPacket = generateBuildPacket({ snippets, projectName: currentProject, selectedIds });
  const detailSnippet =
    state.snippets.find(
      (snippet) => snippet.id === state.detailId && normalizeProjectName(snippet.projectName) === currentProject
    ) || null;

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    nativeStateRef.current = nativeState;
  }, [nativeState]);

  useEffect(() => {
    onboardingRef.current = onboarding;
  }, [onboarding]);

  useEffect(() => {
    const pendingIds = Array.from(pendingSmartTitleIdsRef.current);
    if (!pendingIds.length) {
      return;
    }

    const snippetsById = new Map(state.snippets.map((snippet) => [snippet.id, snippet]));
    pendingIds.forEach((id) => {
      const snippet = snippetsById.get(id);
      if (!snippet) {
        return;
      }

      pendingSmartTitleIdsRef.current.delete(id);
      window.setTimeout(() => requestSmartTitle(snippet), 0);
    });
  }, [state.snippets]);

  useEffect(() => {
    let disposed = false;
    let bridge = null;

    setupNativeBridge({
      onCapture: (payload) => {
        commitNativeCapture(payload).catch(() => showNativeNotice("Couldn't save capture."));
      },
      onCaptureEmpty: (payload) => {
        if (payload?.windowMode === "build") {
          patchState({ panelOpen: false });
          showNativeNotice(payload?.source === "selection" ? "No selected text found." : "Clipboard is empty.");
          return;
        }

        cancelTrayExit();
        patchState({ panelOpen: true });
        showNativeNotice(payload?.source === "selection" ? "No selected text found. Paste manually." : "Clipboard is empty.");
      },
      onOnboardingState: (payload) => {
        setOnboarding(normalizeOnboardingState(payload));
      },
      onSidecarSide: (payload) => {
        const side = payload?.side === "left" ? "left" : "right";
        setNativeState((previous) => (previous.sidecarSide === side ? previous : { ...previous, sidecarSide: side }));
      },
      onStatus: (payload) => {
        setNativeState((previous) => ({
          ...previous,
          available: payload?.available ?? previous.available,
          status: payload?.message || previous.status
        }));
        if (payload?.message) {
          showNativeNotice(payload.message);
        }
      },
      onToggleBuild: () => {
        setNativeWindowMode("build");
        showNativeWindow();
        patchState({ view: "build", panelOpen: false });
      },
      onUpdateAvailable: (payload) => {
        setUpdateAvailable(payload);
        showNativeNotice(`v${payload?.version} available`);
      },
      onWindowBlur: () => {
        if (stateRef.current.panelOpen) {
          scheduleTrayClose(stateRef.current.draftContent, { commitWhileFocused: true });
          return;
        }

        collapseWindowToDock();
      }
    })
      .then((nextBridge) => {
        bridge = nextBridge;
        if (disposed) {
          bridge?.dispose?.();
          return;
        }

        setNativeState({
          available: nextBridge.available,
          shortcutLabel: nextBridge.shortcutLabel,
          status: nextBridge.status,
          sidecarSide: nextBridge.sidecarSide || "right",
          ai: nextBridge.ai || { provider: "openai", configured: false, model: "gpt-5.6-luna" },
          storagePath: nextBridge.storagePath,
          mcpServerPath: nextBridge.mcpServerPath,
          mcpServerName: nextBridge.mcpServerName,
          nodePath: nextBridge.nodePath
        });
        setOnboarding(normalizeOnboardingState(nextBridge.onboarding));

        if (nextBridge.available) {
          completeNativeStorageCutover(serializeExportPayload(state))
            .then((stored) => (stored?.trim() ? stored : readNativeStore()))
            .then((stored) => {
              if (stored?.trim()) {
                const imported = parseImportedState(stored, defaultState);
                lastPersistedSignatureRef.current = durableStateSignature(imported);
                setState(imported);
              }
            })
            .catch(() => showNativeNotice("Could not read local app-data file."));
        }
      })
      .catch(() => {
        if (!disposed) {
          setNativeState({
            available: false,
            shortcutLabel: "Command+Shift+I",
            status: "Native unavailable",
            sidecarSide: "right",
            ai: { provider: "openai", configured: false, model: "gpt-5.6-luna" }
          });
        }
      });

    return () => {
      disposed = true;
      bridge?.dispose?.();
    };
  }, []);

  useLayoutEffect(() => {
    const root = document.documentElement;
    const nextTheme = activeTheme === "dark" ? "dark" : "light";

    root.dataset.theme = nextTheme;
    root.dataset.themePreference = state.themePreference;
    root.style.colorScheme = nextTheme;
  }, [activeTheme, state.themePreference]);

  useLayoutEffect(() => {
    if (isBuild) {
      setNativeWindowMode("build").catch(() => {});
      return;
    }

    if (trayExpanded) {
      setNativeWindowMode("capture", { activate: false }).catch(() => {});
      return;
    }

    setNativeWindowMode("dock", { activate: false }).catch(() => {});
  }, [isBuild, trayExpanded]);

  useEffect(() => {
    async function handleGlobalRichPaste(event) {
      if (event.defaultPrevented || isEditablePasteTarget(event.target)) {
        return;
      }

      const richMarkdown = await markdownFromRichClipboard(event.clipboardData);
      if (!richMarkdown) {
        return;
      }

      event.preventDefault();
      cancelTrayOpenDelay();
      cancelTrayClose();

      if (!isBuild && state.panelOpen) {
        appendDraft(richMarkdown);
        showNativeNotice("Pasted.");
        return;
      }

      if (!isBuild) {
        hoverBlockedUntilRef.current = Date.now() + 700;
      }

      commitContent(richMarkdown, { closePanel: true, notice: "Captured" });
    }

    window.addEventListener("paste", handleGlobalRichPaste);
    return () => window.removeEventListener("paste", handleGlobalRichPaste);
  }, [isBuild, state.panelOpen]);

  useEffect(() => {
    function handleEscape(event) {
      if (event.key !== "Escape") {
        return;
      }

      event.preventDefault();

      if (settingsOpen) {
        setSettingsOpen(false);
        return;
      }

      if (state.detailId) {
        patchState({ detailId: null });
        return;
      }

      if (isBuild) {
        collapseBuildToDock();
        return;
      }

      if (state.panelOpen) {
        commitDraft({ closePanel: true });
        return;
      }

    }

    window.addEventListener("keydown", handleEscape, true);
    return () => window.removeEventListener("keydown", handleEscape, true);
  }, [isBuild, settingsOpen, state.detailId, state.panelOpen, state.draftContent]);

  function patchState(patch) {
    setState((previous) => persist({ ...previous, ...patch }));
  }

  function persist(nextState) {
    const nextSignature = durableStateSignature(nextState);
    if (nextSignature !== lastPersistedSignatureRef.current) {
      lastPersistedSignatureRef.current = nextSignature;
      if (!isElectronRuntime()) {
        saveStoredState(nextState);
      }
      writeNativeStore(serializeExportPayload(nextState)).catch(() => showNativeNotice("Could not save local app-data file."));
    }
    return nextState;
  }

  function cancelTrayClose() {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
      closeTimerDraftRef.current = "";
      closeTimerCommitsWhileFocusedRef.current = false;
    }
  }

  function draftText(value = stateRef.current.draftContent) {
    return typeof value === "string" ? value : stateRef.current.draftContent;
  }

  function isCaptureFieldActive() {
    const activeElement = document.activeElement;
    return Boolean(
      activeElement instanceof HTMLElement &&
        sidecarRootRef.current?.contains(activeElement) &&
        activeElement.closest("input, textarea, [role='combobox'], [role='option'], [role='listbox']")
    );
  }

  function armTrayClose(draftContent = stateRef.current.draftContent, { commitWhileFocused = false } = {}) {
    const nextDraftContent = draftText(draftContent);
    const shouldCommitWhileFocused =
      commitWhileFocused || Boolean(closeTimerRef.current && closeTimerCommitsWhileFocusedRef.current);

    if (
      closeTimerRef.current &&
      closeTimerDraftRef.current === nextDraftContent &&
      closeTimerCommitsWhileFocusedRef.current === shouldCommitWhileFocused
    ) {
      return;
    }

    cancelTrayClose();
    closeTimerDraftRef.current = nextDraftContent;
    closeTimerCommitsWhileFocusedRef.current = shouldCommitWhileFocused;
    closeTimerRef.current = setTimeout(() => {
      if (!shouldCommitWhileFocused && isCaptureFieldActive()) {
        closeTimerRef.current = null;
        closeTimerDraftRef.current = "";
        closeTimerCommitsWhileFocusedRef.current = false;
        return;
      }
      closeTimerRef.current = null;
      closeTimerDraftRef.current = "";
      closeTimerCommitsWhileFocusedRef.current = false;
      commitDraftContent(nextDraftContent, { closePanel: true });
    }, TRAY_CLOSE_DELAY_MS);
  }

  function cancelTrayOpenDelay() {
    if (hoverOpenTimerRef.current) {
      clearTimeout(hoverOpenTimerRef.current);
      hoverOpenTimerRef.current = null;
    }
  }

  function cancelTrayExit() {
    if (trayExitTimerRef.current) {
      clearTimeout(trayExitTimerRef.current);
      trayExitTimerRef.current = null;
    }
    setTrayClosing(false);
  }

  function beginTrayExit() {
    if (!stateRef.current.panelOpen && !trayClosing) {
      return;
    }

    cancelTrayClose();
    cancelTrayOpenDelay();
    if (trayExitTimerRef.current) {
      clearTimeout(trayExitTimerRef.current);
    }
    setTrayClosing(true);
    trayExitTimerRef.current = window.setTimeout(() => {
      trayExitTimerRef.current = null;
      setTrayClosing(false);
    }, TRAY_EXIT_MS);
  }

  function activateCaptureInput() {
    cancelTrayExit();
    cancelTrayClose();
    armTrayClose();
    setNativeWindowMode("capture").catch(() => {});
  }

  function handleCaptureTrayPointerDown(event) {
    if (event.target.closest("button, input, textarea, [role='combobox'], [role='option']")) {
      return;
    }

    activateCaptureInput();
  }

  function handleCaptureTrayFocus(event) {
    if (event.target.closest("button")) {
      return;
    }

    activateCaptureInput();
  }

  function scheduleTrayOpen() {
    cancelTrayOpenDelay();
    if (Date.now() < hoverBlockedUntilRef.current) {
      return;
    }

    if (stateRef.current.panelOpen) {
      cancelTrayClose();
      armTrayClose();
      return;
    }

    cancelTrayClose();
    if (trayClosing) {
      cancelTrayExit();
      setNativeWindowMode("capture", { activate: false }).catch(() => {});
      patchState({ panelOpen: true });
      armTrayClose();
      return;
    }

    cancelTrayExit();

    hoverOpenTimerRef.current = window.setTimeout(() => {
      hoverOpenTimerRef.current = null;
      if (Date.now() < hoverBlockedUntilRef.current || sidecarDragRef.current.active) {
        return;
      }
      if (stateRef.current.panelOpen) {
        cancelTrayClose();
        armTrayClose();
        return;
      }
      cancelTrayExit();
      setNativeWindowMode("capture", { activate: false }).catch(() => {});
      patchState({ panelOpen: true });
      armTrayClose();
    }, 90);
  }

  function scheduleTrayClose(draftContent = stateRef.current.draftContent, options) {
    const nextDraftContent = draftText(draftContent);

    if (!stateRef.current.panelOpen) {
      return;
    }

    cancelTrayOpenDelay();
    armTrayClose(nextDraftContent, options);
  }

  function exitBuildToDock() {
    collapseBuildToDock();
  }

  function collapseBuildToDock() {
    cancelTrayClose();
    cancelTrayOpenDelay();
    cancelTrayExit();
    hoverBlockedUntilRef.current = Date.now() + 700;
    setNativeWindowMode("dock", { activate: false }).catch(() => {});
    patchState({ view: "play", panelOpen: false });
  }

  function collapseWindowToDock() {
    cancelTrayClose();
    cancelTrayOpenDelay();
    cancelTrayExit();
    hoverBlockedUntilRef.current = Date.now() + 700;
    setNativeWindowMode("dock", { activate: false }).catch(() => {});
    patchState({ view: "play", panelOpen: false });
  }

  function setSelectedIds(ids) {
    setState((previous) =>
      persist({
        ...previous,
        selectedIdsByProject: {
          ...previous.selectedIdsByProject,
          [normalizeProjectName(previous.projectName)]: ids
        }
      })
    );
  }

  function commitContent(content, { clipboardFormats, closePanel = true, contentType, id, imagePath, notice = "Saved", title } = {}) {
    const cleanContent = content.trim();
    if (!cleanContent) {
      if (closePanel) {
        beginTrayExit();
        patchState({ panelOpen: false });
      }
      return false;
    }

    if (closePanel) {
      beginTrayExit();
    }

    const pendingSnippet = createSnippet(
      {
        clipboardFormats,
        content: cleanContent,
        contentType,
        id,
        imagePath,
        title,
        projectName: normalizeProjectName(stateRef.current.projectName)
      },
      stateRef.current.snippets.length
    );
    pendingSmartTitleIdsRef.current.add(pendingSnippet.id);

    setState((previous) => {
      const project = normalizeProjectName(previous.projectName);
      const activeSnippets = snippetsForProject(previous.snippets, project);
      const existingSelection = currentSelectedIds(previous, activeSnippets, project);
      const nextProjects = { ...(previous.projects || {}) };
      const snippet = {
        ...pendingSnippet,
        projectName: project,
        order: previous.snippets.length
      };

      if (nextProjects[project]?.archivedAt) {
        const { archivedAt, ...projectMeta } = nextProjects[project];
        nextProjects[project] = {
          ...projectMeta,
          updatedAt: new Date().toISOString()
        };
      }

      window.setTimeout(() => {
        setState((fresh) => persist({ ...fresh, justSaved: false }));
      }, 1200);

      return persist({
        ...previous,
        projects: nextProjects,
        snippets: [...previous.snippets, snippet],
        selectedIdsByProject: {
          ...previous.selectedIdsByProject,
          [project]: [...existingSelection, snippet.id]
        },
        draftContent: "",
        panelOpen: closePanel ? false : previous.panelOpen,
        justSaved: true
      });
    });

    showNativeNotice(notice);
    return true;
  }

  async function requestSmartTitle(snippet) {
    const currentState = stateRef.current;

    if (!currentState.smartTitlesEnabled || !nativeStateRef.current.ai?.configured) {
      return;
    }

    const contentType = snippet.contentType || detectContentType(snippet.content);
    const excerpt = excerptForSmartTitle({ content: snippet.content, contentType });
    const imageDataUrl = contentType === "Image" ? await readNativePinImageDataUrl(snippet.id).catch(() => "") : "";
    if (!excerpt && !imageDataUrl) {
      return;
    }

    try {
      const result = await generateNativePinTitle({
        content: excerpt,
        contentType,
        imageDataUrl,
        fallbackTitle: snippet.title
      });

      if (!result?.ok || !result.text?.trim()) {
        if (result?.message) {
          showNativeNotice(result.message);
        }
        return;
      }

      setState((previous) => {
        const current = previous.snippets.find((item) => item.id === snippet.id);
        if (!shouldApplyGeneratedTitle(current, snippet.title)) {
          return previous;
        }

        return persist({
          ...previous,
          snippets: previous.snippets.map((item) =>
            item.id === snippet.id
              ? {
                  ...item,
                  title: result.text.trim(),
                  smartTitleGeneratedAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString()
                }
              : item
          )
        });
      });
    } catch {
      showNativeNotice("Smart title failed.");
      // Smart titles are opportunistic and must never break capture.
    }
  }

  async function prepareNativeCapturePayload(payload) {
    if (payload?.imagePath) {
      return payload;
    }

    const imageDataUrl = imageDataUrlFromCapturePayload(payload);
    if (!imageDataUrl) {
      return payload;
    }

    const pinId = payload?.id || crypto.randomUUID();
    const result = await writeNativePinImage({ imageDataUrl, pinId });
    return createFileBackedImageCapturePayload(payload, {
      imagePath: result?.imagePath || `images/${pinId}.png`,
      pinId
    });
  }

  async function commitNativeCapture(payload) {
    const preparedPayload = await prepareNativeCapturePayload(payload);
    const captured = payload?.content?.trim();
    if (!captured) {
      cancelTrayExit();
      patchState({ panelOpen: true });
      showNativeNotice("Clipboard is empty.");
      return;
    }

    cancelTrayOpenDelay();
    cancelTrayClose();
    if (preparedPayload?.windowMode !== "build") {
      hoverBlockedUntilRef.current = Date.now() + 700;
    }

    const saved = commitContent(preparedPayload.content, {
      clipboardFormats: preparedPayload?.clipboardFormats,
      closePanel: true,
      contentType: preparedPayload?.contentType,
      id: preparedPayload?.id,
      imagePath: preparedPayload?.imagePath,
      notice:
        preparedPayload?.source === "screenshot"
          ? "Captured screenshot"
          : preparedPayload?.source === "selection"
            ? "Captured selection"
            : "Captured clipboard",
      title: preparedPayload?.title
    });

    if (!saved) {
      return;
    }

    if (!onboardingRef.current.clipboardLessonComplete) {
      const nextOnboarding = await completeNativeOnboardingStep("clipboard");
      setOnboarding(normalizeOnboardingState(nextOnboarding));
      await wait(ONBOARDING_BOARD_OPEN_DELAY_MS);
      setNativeWindowMode("build").catch(() => {});
      patchState({ view: "build", panelOpen: false });
      return;
    }

    if (preparedPayload?.source === "screenshot" && !onboardingRef.current.screenshotLessonComplete) {
      const nextOnboarding = await completeNativeOnboardingStep("screenshot");
      setOnboarding(normalizeOnboardingState(nextOnboarding));
    }
  }

  function commitDraft({ closePanel = true } = {}) {
    commitDraftContent(state.draftContent, { closePanel });
  }

  function commitDraftContent(draftContent, { closePanel = true } = {}) {
    const nextDraftContent = draftText(draftContent);

    cancelTrayClose();
    if (!nextDraftContent.trim()) {
      if (closePanel) {
        beginTrayExit();
        patchState({ panelOpen: false });
      }
      return;
    }

    commitContent(nextDraftContent, { closePanel, notice: "Saved" });
  }

  function openBoard() {
    cancelTrayClose();
    cancelTrayOpenDelay();
    cancelTrayExit();

    if (state.draftContent.trim()) {
      commitContent(state.draftContent, { closePanel: false, notice: "Saved" });
    }

    setNativeWindowMode("build").catch(() => {});
    patchState({ view: "build", panelOpen: false });
  }

  function switchProject(projectName) {
    const project = normalizeProjectName(projectName);
    setState((previous) => {
      const nextProjects = { ...(previous.projects || {}) };
      if (nextProjects[project]?.archivedAt) {
        const { archivedAt, ...projectMeta } = nextProjects[project];
        nextProjects[project] = {
          ...projectMeta,
          updatedAt: new Date().toISOString()
        };
      }

      return persist({ ...previous, projects: nextProjects, projectName: project, detailId: null });
    });
  }

  function deleteProject(projectName) {
    const project = normalizeProjectName(projectName);

    setState((previous) => {
      const removedIds = new Set(
        previous.snippets
          .filter((snippet) => normalizeProjectName(snippet.projectName) === project)
          .map((snippet) => snippet.id)
      );
      const nextSnippets = previous.snippets.filter((snippet) => normalizeProjectName(snippet.projectName) !== project);
      const nextProjects = { ...(previous.projects || {}) };
      const nextSelectedIdsByProject = { ...(previous.selectedIdsByProject || {}) };
      delete nextProjects[project];
      delete nextSelectedIdsByProject[project];

      const nextProject =
        normalizeProjectName(previous.projectName) === project
          ? nextActiveProjectName(nextSnippets, nextProjects)
          : normalizeProjectName(previous.projectName);

      return persist({
        ...previous,
        snippets: nextSnippets,
        projects: nextProjects,
        selectedIdsByProject: nextSelectedIdsByProject,
        projectName: nextProject,
        detailId: removedIds.has(previous.detailId) ? null : previous.detailId
      });
    });

    showNativeNotice(`Deleted ${project}.`);
  }

  function archiveSnippet(id) {
    const nextSnippets = state.snippets.map((snippet) =>
      snippet.id === id
        ? { ...snippet, archivedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
        : snippet
    );
    patchState({
      snippets: nextSnippets,
      detailId: state.detailId === id ? null : state.detailId,
      selectedIdsByProject: {
        ...state.selectedIdsByProject,
        [currentProject]: selectedIds.filter((selectedId) => selectedId !== id)
      }
    });
  }

  function restoreSnippet(id) {
    const snippet = state.snippets.find((item) => item.id === id);
    if (!snippet) {
      return;
    }

    patchState({
      snippets: state.snippets.map((item) => {
        if (item.id !== id) {
          return item;
        }

        const { archivedAt, ...restored } = item;
        return {
          ...restored,
          updatedAt: new Date().toISOString()
        };
      }),
      selectedIdsByProject: {
        ...state.selectedIdsByProject,
        [currentProject]: selectedIds.includes(id) ? selectedIds : [...selectedIds, id]
      }
    });
  }

  function deleteSnippet(id) {
    patchState({
      snippets: state.snippets.filter((snippet) => snippet.id !== id),
      detailId: state.detailId === id ? null : state.detailId,
      selectedIdsByProject: {
        ...state.selectedIdsByProject,
        [currentProject]: selectedIds.filter((selectedId) => selectedId !== id)
      }
    });
  }

  function editSnippet(id, values) {
    setState((previous) =>
      persist({
        ...previous,
        snippets: editPin(previous.snippets, id, values)
      })
    );
  }

  function reorderSnippet(sourceId, targetId) {
    setState((previous) =>
      persist({
        ...previous,
        snippets: reorderProjectSnippets(previous.snippets, {
          projectName: normalizeProjectName(previous.projectName),
          sourceId,
          targetId
        })
      })
    );
  }

  async function copyText(text, copiedKind) {
    const value = String(text || "");
    const trimmed = value.trim();
    if (!trimmed || trimmed === "No pinned material selected.") {
      return;
    }

    const imageDataUrl = imageDataUrlFromMarkdown(trimmed);
    const pinImageId = pinImageIdFromMarkdown(trimmed);
    try {
      const wroteNatively = pinImageId
        ? await copyNativePinImage(pinImageId)
        : await writeNativeClipboard(imageDataUrl ? { imageDataUrl } : value);
      if (!wroteNatively) {
        if (!imageDataUrl || !(await writeBrowserImageClipboard(imageDataUrl))) {
          await navigator.clipboard.writeText(value);
        }
      }
    } catch {
      const fallback = document.createElement("textarea");
      fallback.value = value;
      fallback.setAttribute("readonly", "");
      fallback.style.position = "fixed";
      fallback.style.opacity = "0";
      document.body.appendChild(fallback);
      fallback.select();
      document.execCommand("copy");
      fallback.remove();
    }

    patchState({ copied: copiedKind });
    if (copiedKind === "packet") {
      showNativeNotice(`Copied - ${selectedIds.length || snippets.length} pins`);
    }
    window.setTimeout(() => patchState({ copied: null }), 1200);
  }

  async function captureClipboard({ copySelectionFirst }) {
    cancelTrayClose();

    if (await captureNativeClipboard({ copySelectionFirst })) {
      return;
    }

    patchState({ panelOpen: true });
    showNativeNotice("Desktop capture runs in Electron.");
  }

  async function dismissScreenshotOnboarding() {
    const nextOnboarding = await completeNativeOnboardingStep("screenshot");
    setOnboarding(normalizeOnboardingState(nextOnboarding));
  }

  async function startScreenshotOnboarding() {
    const nextOnboarding = await completeNativeOnboardingStep("screenshot");
    setOnboarding(normalizeOnboardingState(nextOnboarding));
    await captureNativeScreenshotRegion();
  }

  async function handlePaste(event) {
    const richMarkdown = await markdownFromRichClipboard(event.clipboardData);
    if (richMarkdown) {
      event.preventDefault();
      appendDraft(richMarkdown);
      return;
    }

    const html = event.clipboardData?.getData("text/html");
    if (html && /<(table|pre|code|h[1-6]|ul|ol|li|img)\b/i.test(html)) {
      const markdown = htmlToMarkdown(html);
      if (markdown.trim()) {
        event.preventDefault();
        appendDraft(markdown);
      }
    }
  }

  function appendDraft(value) {
    setState((previous) => {
      const spacer = previous.draftContent.trim() ? "\n\n" : "";
      return persist({ ...previous, draftContent: `${previous.draftContent}${spacer}${value}` });
    });
  }

  async function saveApiKey() {
    if (!apiKeyDraft.trim()) {
      showNativeNotice("Paste an OpenAI API key first.");
      return;
    }

    setAiSaving(true);
    try {
      const ai = await saveNativeOpenAIApiKey(apiKeyDraft);
      setNativeState((previous) => ({ ...previous, ai }));
      setApiKeyDraft("");
      if (!ai?.ok) {
        showNativeNotice(ai?.message || "Could not save OpenAI key.");
        return;
      }
      showNativeNotice(`OpenAI key saved${ai?.source ? ` to ${ai.source}` : ""}.`);
    } catch {
      setApiKeyDraft("");
      showNativeNotice("Could not save OpenAI key.");
    } finally {
      setAiSaving(false);
    }
  }

  async function clearApiKey() {
    setAiSaving(true);
    try {
      const ai = await clearNativeOpenAIApiKey();
      setNativeState((previous) => ({ ...previous, ai }));
      patchState({ smartTitlesEnabled: false });
      setApiKeyDraft("");
      showNativeNotice("OpenAI key cleared.");
    } catch (error) {
      showNativeNotice(error?.message || "Could not clear OpenAI key.");
    } finally {
      setAiSaving(false);
    }
  }

  async function retryApiKeyStorage() {
    setAiSaving(true);
    try {
      const ai = await refreshNativeOpenAIApiKeyStatus();
      setNativeState((previous) => ({ ...previous, ai }));
      showNativeNotice(
        ai?.errorCode ? "macOS Keychain is still unavailable." : "macOS Keychain is ready. You can save an API key."
      );
    } catch {
      showNativeNotice("Could not recheck macOS Keychain access.");
    } finally {
      setAiSaving(false);
    }
  }

  function setThemePreference(themePreference) {
    patchState({ themePreference: normalizeThemePreference(themePreference) });
  }

  function showNativeNotice(message) {
    setNativeNotice(message);
    if (!state.soundMuted && isCaptureSuccessNotice(message)) {
      playCaptureSound();
    }
    window.setTimeout(() => setNativeNotice(""), 1800);
  }

  function beginSidecarDrag(event) {
    if (event.button !== 0) {
      return;
    }

    cancelTrayClose();
    cancelTrayOpenDelay();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    sidecarDragRef.current = {
      active: true,
      lastX: event.screenX,
      lastY: event.screenY,
      moved: false,
      suppressClick: false
    };
  }

  function moveSidecarDrag(event) {
    const drag = sidecarDragRef.current;
    if (!drag.active) {
      return;
    }

    const dx = event.screenX - drag.lastX;
    const dy = event.screenY - drag.lastY;
    if (!dx && !dy) {
      return;
    }

    drag.lastX = event.screenX;
    drag.lastY = event.screenY;
    drag.moved = drag.moved || Math.abs(dx) + Math.abs(dy) > 3;
    sidecarDragRef.current = drag;
    void moveNativeWindowBy({ dx, dy });
  }

  function endSidecarDrag(event) {
    const drag = sidecarDragRef.current;
    if (!drag.active) {
      return;
    }

    event.currentTarget.releasePointerCapture?.(event.pointerId);
    sidecarDragRef.current = {
      ...drag,
      active: false,
      suppressClick: drag.moved
    };

    if (!drag.moved) {
      return;
    }

    snapNativeWindowToSide()
      .then((side) => {
        setNativeState((previous) => ({
          ...previous,
          sidecarSide: side === "left" ? "left" : "right"
        }));
      })
      .catch(() => {});

    window.setTimeout(() => {
      sidecarDragRef.current = {
        ...sidecarDragRef.current,
        suppressClick: false
      };
    }, 180);
  }

  const dockCaptureNotice = !isBuild && !trayExpanded && isCaptureSuccessNotice(nativeNotice) ? nativeNotice : "";
  const shouldShowNoticeToast = nativeNotice && (!isCaptureSuccessNotice(nativeNotice) || isBuild);

  return (
    <main className={`surface ${isBuild ? "build-open" : trayExpanded ? "capture-open" : "dock-open"}`}>
      {!isBuild ? (
        <SidecarDock
          dockCaptureNotice={dockCaptureNotice}
          draftContent={state.draftContent}
          isClosing={trayClosing}
          isOpen={state.panelOpen}
          justSaved={state.justSaved}
          pinCount={snippets.length}
          projectList={projectList}
          projectName={state.projectName}
          rootRef={sidecarRootRef}
          side={nativeState.sidecarSide}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) {
              scheduleTrayClose(undefined, { commitWhileFocused: true });
            }
          }}
          onDockClick={() => {
            if (sidecarDragRef.current.suppressClick) {
              return;
            }
            cancelTrayClose();
            if (state.panelOpen) {
              hoverBlockedUntilRef.current = Date.now() + 700;
              commitDraft({ closePanel: true });
              return;
            }
            setNativeWindowMode("capture").catch(() => {});
            cancelTrayExit();
            patchState({ panelOpen: true });
          }}
          onDockPointerCancel={endSidecarDrag}
          onDockPointerDown={beginSidecarDrag}
          onDockPointerMove={moveSidecarDrag}
          onDockPointerUp={endSidecarDrag}
          onDraftChange={(nextDraft) => {
            patchState({ draftContent: nextDraft });
            scheduleTrayClose(nextDraft);
          }}
          onDraftKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              commitDraft({ closePanel: true });
            }
          }}
          onFocus={() => scheduleTrayClose()}
          onMouseEnter={scheduleTrayOpen}
          onMouseLeave={() => scheduleTrayClose()}
          onOpenBoard={openBoard}
          onPaste={handlePaste}
          onProjectCommit={switchProject}
          onProjectDraft={(value) => patchState({ projectName: value })}
          onTrayFocus={handleCaptureTrayFocus}
          onTrayPointerDown={handleCaptureTrayPointerDown}
        />
      ) : (
        <BuildMode
          copied={state.copied}
          currentProject={currentProject}
          buildPacket={buildPacket}
          projectList={projectList}
          selectedIds={selectedIds}
          selectedSet={selectedSet}
          allSnippets={state.snippets}
          archivedSnippets={archivedSnippets}
          snippets={snippets}
          nativeState={nativeState}
          screenshotOnboarding={
            nativeState.available &&
            onboarding.clipboardLessonComplete &&
            !onboarding.screenshotLessonComplete &&
            snippets.length > 0
              ? { shortcutLabel: screenshotShortcutLabel(nativeState.shortcutLabel) }
              : null
          }
          onArchive={archiveSnippet}
          onCopy={copyText}
          onDelete={deleteSnippet}
          onDeleteProject={deleteProject}
          onCloseBuild={exitBuildToDock}
          onOpenDetail={(id) => patchState({ detailId: id })}
          onOpenSettings={() => setSettingsOpen(true)}
          onProject={switchProject}
          onReorder={reorderSnippet}
          onRestore={restoreSnippet}
          onDeselectAll={() => setSelectedIds([])}
          onSelectAll={() => setSelectedIds(snippets.map((snippet) => snippet.id))}
          onSelected={setSelectedIds}
          onDismissScreenshotOnboarding={dismissScreenshotOnboarding}
          onStartScreenshotOnboarding={startScreenshotOnboarding}
        />
      )}

      {isBuild && settingsOpen ? (
        <SettingsDialog
          apiKeyDraft={apiKeyDraft}
          aiSaving={aiSaving}
          activeTheme={activeTheme}
          nativeState={nativeState}
          soundMuted={state.soundMuted}
          smartTitlesEnabled={state.smartTitlesEnabled}
          themePreference={state.themePreference}
          onApiKeyDraft={setApiKeyDraft}
          onClearApiKey={clearApiKey}
          onClose={() => setSettingsOpen(false)}
          onRetryApiKeyStorage={retryApiKeyStorage}
          onSaveApiKey={saveApiKey}
          onSoundMuted={(soundMuted) => patchState({ soundMuted })}
          onSmartTitlesEnabled={(smartTitlesEnabled) => patchState({ smartTitlesEnabled })}
          onThemePreference={setThemePreference}
        />
      ) : null}

      {shouldShowNoticeToast ? (
        <div className="notice-toast" role="status" aria-live="polite">
          {nativeNotice}
          {updateAvailable?.url ? (
            <Button type="button" variant="tertiary" size="sm" className="notice-action" onClick={() => openNativeUrl(updateAvailable.url)}>
              Download
            </Button>
          ) : null}
        </div>
      ) : null}

      {isBuild && detailSnippet ? (
        <NoteDetail
          copied={state.copied}
          snippet={detailSnippet}
          onClose={() => patchState({ detailId: null })}
          onCopy={copyText}
          onNavigate={(id) => patchState({ detailId: id })}
          onSave={editSnippet}
        />
      ) : null}
    </main>
  );
}

function readSystemTheme() {
  if (typeof window === "undefined" || !window.matchMedia) {
    return "light";
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function nextActiveProjectName(snippets, projects = {}, excludedProject = "") {
  const excluded = excludedProject ? normalizeProjectName(excludedProject) : "";
  const names = new Set();

  snippets.forEach((snippet) => {
    const name = normalizeProjectName(snippet.projectName);
    if (name !== excluded) {
      names.add(name);
    }
  });
  Object.keys(projects || {}).forEach((projectName) => {
    const name = normalizeProjectName(projectName);
    if (name !== excluded) {
      names.add(name);
    }
  });

  return (
    [...names]
      .filter((name) => name)
      .sort((a, b) => a.localeCompare(b))[0] || "Untitled artifact"
  );
}

function currentSelectedIds(state, snippets, projectName) {
  const saved = state.selectedIdsByProject[projectName];

  if (!saved) {
    return snippets.map((snippet) => snippet.id);
  }

  const validIds = new Set(snippets.map((snippet) => snippet.id));
  return saved.filter((id) => validIds.has(id));
}

function normalizeOnboardingState(value) {
  return {
    clipboardLessonComplete: Boolean(value?.clipboardLessonComplete),
    screenshotLessonComplete: Boolean(value?.screenshotLessonComplete)
  };
}

function screenshotShortcutLabel(shortcutLabel = "") {
  return (
    shortcutLabel
      .split("/")
      .map((label) => label.trim())
      .filter(Boolean)[1] || "Command+Shift+O"
  );
}

function deriveEditableTitle(content = "") {
  const firstLine = content
    .split("\n")
    .map((line) => line.replace(/^#+\s*/, "").replace(/^```[a-zA-Z0-9_-]*\s*$/, "").trim())
    .find(Boolean);

  if (!firstLine) {
    return "Untitled pin";
  }

  return firstLine.length > 54 ? `${firstLine.slice(0, 51)}...` : firstLine;
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result));
    reader.addEventListener("error", reject);
    reader.readAsDataURL(file);
  });
}

function pinImageIdFromMarkdown(value = "") {
  const match = value.trim().match(/^!\[[^\]]*]\(pinit:\/\/pin\/([0-9a-f-]{36})\/image\)$/i);
  return match?.[1] || "";
}

async function writeBrowserImageClipboard(dataUrl) {
  if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) {
    return false;
  }

  try {
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
    return true;
  } catch {
    return false;
  }
}

async function markdownFromRichClipboard(clipboardData) {
  const file = imageFileFromClipboard(clipboardData);
  if (file) {
    const dataUrl = await readAsDataUrl(file);
    return `![Pasted image](${dataUrl})`;
  }

  const html = clipboardData?.getData("text/html") || "";
  if (!/<(table|pre|code|h[1-6]|ul|ol|li|img)\b/i.test(html)) {
    return "";
  }

  const markdown = htmlToMarkdown(html);
  return markdown.trim();
}

function imageFileFromClipboard(clipboardData) {
  const items = [...(clipboardData?.items || [])];
  const imageItem = items.find((item) => item.type.startsWith("image/"));
  if (imageItem) {
    return imageItem.getAsFile();
  }

  return [...(clipboardData?.files || [])].find((file) => file.type.startsWith("image/")) || null;
}

function isEditablePasteTarget(target) {
  return (
    target instanceof HTMLElement &&
    Boolean(target.closest("input, textarea, [contenteditable='true'], [contenteditable='']"))
  );
}

function htmlToMarkdown(html) {
  const documentFragment = new DOMParser().parseFromString(html, "text/html");
  const parts = [...documentFragment.body.childNodes].map(nodeToMarkdown).filter(Boolean);
  return parts.join("\n\n").trim();
}

function nodeToMarkdown(node) {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent.replace(/\s+/g, " ").trim();
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return "";
  }

  const element = node;
  const tag = element.tagName.toLowerCase();
  const children = [...element.childNodes].map(nodeToMarkdown).filter(Boolean).join("\n\n");
  const text = element.textContent.replace(/\s+/g, " ").trim();

  if (/^h[1-6]$/.test(tag)) {
    return `${"#".repeat(Number(tag[1]))} ${text}`;
  }

  if (tag === "pre") {
    return `\`\`\`\n${element.textContent.trim()}\n\`\`\``;
  }

  if (tag === "code") {
    return `\`${text}\``;
  }

  if (tag === "img") {
    const src = element.getAttribute("src")?.trim();
    if (!src) {
      return "";
    }
    const alt = (element.getAttribute("alt") || "Pasted image").replaceAll("[", "(").replaceAll("]", ")");
    return `![${alt}](${src})`;
  }

  if (tag === "ul" || tag === "ol") {
    return [...element.children]
      .filter((child) => child.tagName.toLowerCase() === "li")
      .map((child, index) => `${tag === "ol" ? `${index + 1}.` : "-"} ${child.textContent.trim()}`)
      .join("\n");
  }

  if (tag === "table") {
    return tableToMarkdown(element);
  }

  if (tag === "br") {
    return "\n";
  }

  return children || text;
}

function tableToMarkdown(table) {
  const rows = [...table.querySelectorAll("tr")].map((row) =>
    [...row.children].map((cell) => cell.textContent.replace(/\s+/g, " ").replaceAll("|", "\\|").trim())
  );

  if (!rows.length) {
    return "";
  }

  const columnCount = Math.max(...rows.map((row) => row.length));
  const normalized = rows.map((row) => [...row, ...Array(columnCount - row.length).fill("")]);
  const [header, ...body] = normalized;
  const divider = Array(columnCount).fill("---");
  const markdownRows = [header, divider, ...body];

  return markdownRows.map((row) => `| ${row.join(" | ")} |`).join("\n");
}

const appRootElement = document.querySelector("#app");
const appRoot = globalThis.__KEEP_THAT_REACT_ROOT__ || createRoot(appRootElement);
globalThis.__KEEP_THAT_REACT_ROOT__ = appRoot;

appRoot.render(
  <React.StrictMode>
    <IconContext.Provider value={{ color: "currentColor", weight: "regular" }}>
      <App />
    </IconContext.Provider>
  </React.StrictMode>
);
