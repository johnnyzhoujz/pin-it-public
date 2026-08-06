export const STORAGE_KEY = "keep-that:prototype:v4";
export const LEGACY_STORAGE_KEYS = ["keep-that:prototype:v3"];
export const STORAGE_SCHEMA_VERSION = 1;

const volatileState = {
  copied: null,
  detailId: null,
  panelOpen: false,
  justSaved: false,
  view: "play"
};

export function loadStoredState(defaultState, storage = globalThis.localStorage) {
  try {
    const stored = storage.getItem(STORAGE_KEY) || readLegacyState(storage);
    if (!stored) {
      return structuredClone(defaultState);
    }

    return normalizeStoredState(JSON.parse(stored), defaultState);
  } catch {
    return structuredClone(defaultState);
  }
}

export function saveStoredState(state, storage = globalThis.localStorage) {
  storage.setItem(STORAGE_KEY, JSON.stringify(stripVolatileState(state)));
}

export function durableStateSignature(state) {
  return JSON.stringify(stripVolatileState(state));
}

export function normalizeImportedState(value, defaultState) {
  return normalizeStoredState(value?.data || value, defaultState);
}

export function serializeExportPayload(state) {
  return `${JSON.stringify(createExportPayload(state), null, 2)}\n`;
}

export function createExportPayload(state) {
  const cleanState = stripVolatileState(state);

  return {
    app: "Pin It",
    schemaVersion: STORAGE_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    data: {
      projectName: cleanState.projectName,
      draftContent: cleanState.draftContent,
      metaPrompt: cleanState.metaPrompt,
      metaPromptsByProject: cleanState.metaPromptsByProject || {},
      projects: cleanState.projects || {},
      soundMuted: Boolean(cleanState.soundMuted),
      smartTitlesEnabled: Boolean(cleanState.smartTitlesEnabled),
      themePreference: cleanState.themePreference,
      selectedIdsByProject: cleanState.selectedIdsByProject || {},
      snippets: cleanState.snippets || []
    }
  };
}

export function parseImportedState(text, defaultState) {
  const parsed = JSON.parse(text);
  return normalizeImportedState(parsed, defaultState);
}

export function storageSummary(state) {
  const snippets = Array.isArray(state.snippets) ? state.snippets : [];
  const active = snippets.filter((snippet) => !snippet.archivedAt).length;
  const archived = snippets.length - active;
  const projects = new Set([
    ...snippets.map((snippet) => snippet.projectName).filter(Boolean),
    ...Object.keys(state.projects || {})
  ]).size;

  return { active, archived, projects, total: snippets.length };
}

function readLegacyState(storage) {
  return LEGACY_STORAGE_KEYS.map((key) => storage.getItem(key)).find(Boolean) || null;
}

function normalizeStoredState(value, defaultState) {
  const fallback = structuredClone(defaultState);
  const snippets = Array.isArray(value?.snippets) ? value.snippets : [];
  const selectedIdsByProject =
    value?.selectedIdsByProject && typeof value.selectedIdsByProject === "object" ? value.selectedIdsByProject : {};
  const projectName = typeof value?.projectName === "string" ? value.projectName : fallback.projectName;
  const hasMetaPromptsByProject = value?.metaPromptsByProject && typeof value.metaPromptsByProject === "object";
  const metaPromptsByProject = hasMetaPromptsByProject ? value.metaPromptsByProject : {};
  const projects = value?.projects && typeof value.projects === "object" ? value.projects : {};
  const legacyMetaPrompt = typeof value?.metaPrompt === "string" ? value.metaPrompt : "";
  const normalizedMetaPromptsByProject = {
    ...metaPromptsByProject,
    ...(!hasMetaPromptsByProject && legacyMetaPrompt.trim() ? { [projectName]: legacyMetaPrompt } : {})
  };

  return {
    ...fallback,
    ...value,
    ...volatileState,
    projectName,
    draftContent: typeof value?.draftContent === "string" ? value.draftContent : "",
    metaPrompt: legacyMetaPrompt,
    metaPromptsByProject: normalizedMetaPromptsByProject,
    projects,
    soundMuted: Boolean(value?.soundMuted),
    smartTitlesEnabled: Boolean(value?.smartTitlesEnabled),
    themePreference: normalizeThemePreference(value?.themePreference ?? fallback.themePreference),
    selectedIdsByProject,
    snippets
  };
}

function stripVolatileState(state) {
  return {
    ...state,
    ...volatileState
  };
}

function normalizeThemePreference(value) {
  return value === "dark" || value === "light" || value === "system" ? value : "system";
}
