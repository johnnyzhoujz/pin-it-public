import { deriveFallbackTitle } from "./titles/smartTitles.js";

export function detectContentType(content = "") {
  const value = content.trim();

  if (!value) {
    return "Text";
  }

  if (/!\[[^\]]*]\([^)]+\)/.test(value) || /^https?:\/\/\S+\.(png|jpe?g|gif|webp|svg)(\?\S*)?$/i.test(value)) {
    return "Image";
  }

  if (/```[\s\S]*```/.test(value) || /<\/?[a-z][\s\S]*>/i.test(value)) {
    return "Code";
  }

  if (/^\s*(const|let|var|function|class|import|export|def|from|SELECT|INSERT|UPDATE|DELETE)\b/m.test(value)) {
    return "Code";
  }

  if (/^#{1,6}\s|\*\*[^*]+\*\*|^\s*[-*]\s+/m.test(value)) {
    return "Markdown";
  }

  return "Text";
}

export function sortSnippets(snippets) {
  return [...snippets].sort((a, b) => {
    const orderA = Number.isFinite(a.order) ? a.order : 0;
    const orderB = Number.isFinite(b.order) ? b.order : 0;

    if (orderA !== orderB) {
      return orderA - orderB;
    }

    const createdA = Date.parse(a.createdAt || "") || 0;
    const createdB = Date.parse(b.createdAt || "") || 0;
    return createdA - createdB;
  });
}

export function createSnippet({ clipboardFormats, content, contentType, id, imagePath, projectName, title }, order) {
  const now = new Date().toISOString();
  const cleanContent = content?.trim() || "";
  const cleanProject = normalizeProjectName(projectName);
  const cleanFormats = normalizeClipboardFormats(clipboardFormats);

  return {
    id: id || crypto.randomUUID(),
    title: deriveFallbackTitle({ content: cleanContent, contentType, title }),
    content: cleanContent,
    contentType: contentType || detectContentType(cleanContent),
    ...(imagePath ? { imagePath } : {}),
    ...(Object.keys(cleanFormats).length ? { clipboardFormats: cleanFormats } : {}),
    projectName: cleanProject,
    order,
    createdAt: now,
    updatedAt: now
  };
}

function normalizeClipboardFormats(value) {
  if (!value || typeof value !== "object") {
    return {};
  }

  return {
    ...(typeof value.text === "string" && value.text.trim() ? { text: value.text } : {}),
    ...(typeof value.html === "string" && value.html.trim() ? { html: value.html } : {}),
    ...(typeof value.imageDataUrl === "string" && value.imageDataUrl.startsWith("data:image/")
      ? { imageDataUrl: value.imageDataUrl }
      : {})
  };
}

export function normalizeProjectName(projectName = "") {
  return projectName.trim() || "Untitled artifact";
}

export function projectNames(snippets, currentProjectName = "", projects = {}) {
  const names = new Set([normalizeProjectName(currentProjectName)]);
  snippets.forEach((snippet) => {
    names.add(normalizeProjectName(snippet.projectName));
  });
  Object.keys(projects || {}).forEach((projectName) => {
    names.add(normalizeProjectName(projectName));
  });

  return [...names].filter((name) => name).sort((a, b) => a.localeCompare(b));
}

export function snippetsForProject(snippets, projectName) {
  const cleanProject = normalizeProjectName(projectName);
  return sortSnippets(snippets).filter(
    (snippet) => !snippet.archivedAt && normalizeProjectName(snippet.projectName) === cleanProject
  );
}

export function archivedSnippetsForProject(snippets, projectName) {
  const cleanProject = normalizeProjectName(projectName);
  return sortSnippets(snippets).filter(
    (snippet) => snippet.archivedAt && normalizeProjectName(snippet.projectName) === cleanProject
  );
}

export function generateBuildPacket({ snippets, projectName, selectedIds, metaPrompt = "" }) {
  const selected = selectedSnippets(snippets, selectedIds);
  const cleanProject = normalizeProjectName(projectName);
  const instruction =
    metaPrompt.trim() ||
    "Use the material below as accepted working context. Continue from these pins instead of restarting from scratch.";

  const sections = [
    "# Use These Pins",
    "",
    `Project / artifact: ${cleanProject}`,
    "",
    "## Intent",
    "",
    "I am bringing forward saved material that should shape the next response.",
    "",
    instruction,
    "",
    "## Included pins",
    "",
    formatSnippets(selected)
  ];

  return sections.join("\n").trimEnd() + "\n";
}

function selectedSnippets(snippets, selectedIds) {
  if (!Array.isArray(selectedIds)) {
    return sortSnippets(snippets).filter((snippet) => !snippet.archivedAt);
  }

  const selected = new Set(selectedIds);
  return sortSnippets(snippets).filter((snippet) => selected.has(snippet.id));
}

function formatSnippets(snippets) {
  if (!snippets.length) {
    return "No pinned material selected.";
  }

  return snippets
    .map((snippet, index) => {
      return [
        `### ${index + 1}. ${snippet.title || "Untitled pin"}`,
        "",
        `Type: ${snippet.contentType || detectContentType(snippet.content)}`,
        `Added: ${formatTimestamp(snippet.createdAt)}`,
        "",
        snippet.content?.trim() || "_No content saved._"
      ].join("\n");
    })
    .join("\n\n");
}

function formatTimestamp(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return date.toISOString().replace(".000Z", "Z");
}
