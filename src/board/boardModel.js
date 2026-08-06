import { detectContentType, normalizeProjectName, sortSnippets } from "../packet.js";

export function filterBoardSnippets(snippets, query = "") {
  const needle = query.trim().toLowerCase();
  const sorted = sortSnippets(snippets);

  if (!needle) {
    return sorted;
  }

  return sorted.filter((snippet) =>
    [snippet.title, snippet.content, snippet.projectName, snippet.contentType]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(needle))
  );
}

export function reorderProjectSnippets(snippets, { projectName, sourceId, targetId }) {
  if (!sourceId || !targetId || sourceId === targetId) {
    return snippets;
  }

  const project = normalizeProjectName(projectName);
  const projectSnippets = sortSnippets(snippets).filter((snippet) => normalizeProjectName(snippet.projectName) === project);
  const sourceIndex = projectSnippets.findIndex((snippet) => snippet.id === sourceId);
  const targetIndex = projectSnippets.findIndex((snippet) => snippet.id === targetId);

  if (sourceIndex < 0 || targetIndex < 0) {
    return snippets;
  }

  const reordered = [...projectSnippets];
  const [moved] = reordered.splice(sourceIndex, 1);
  reordered.splice(targetIndex, 0, moved);
  const orderById = new Map(reordered.map((snippet, index) => [snippet.id, index]));
  const now = new Date().toISOString();

  return snippets.map((snippet) => {
    if (normalizeProjectName(snippet.projectName) !== project || !orderById.has(snippet.id)) {
      return snippet;
    }

    return {
      ...snippet,
      order: orderById.get(snippet.id),
      updatedAt: now
    };
  });
}

export function editPin(snippets, id, { title, content }) {
  const now = new Date().toISOString();
  return snippets.map((snippet) => {
    if (snippet.id !== id) {
      return snippet;
    }

    const nextTitle = String(title ?? snippet.title ?? "").trim() || "Untitled pin";
    const isImage = snippet.imagePath || (snippet.contentType || detectContentType(snippet.content)) === "Image";
    const nextContent = isImage ? imagePlaceholder(snippet.id, nextTitle) : String(content ?? snippet.content ?? "").trim();

    return {
      ...snippet,
      title: nextTitle,
      content: nextContent,
      contentType: isImage ? "Image" : detectContentType(nextContent),
      titleEditedAt: now,
      updatedAt: now
    };
  });
}

export function nextBoardFocusIndex({ currentIndex = 0, key, count }) {
  if (!count) {
    return -1;
  }

  if (key === "ArrowDown" || key === "ArrowRight") {
    return Math.min(currentIndex + 1, count - 1);
  }

  if (key === "ArrowUp" || key === "ArrowLeft") {
    return Math.max(currentIndex - 1, 0);
  }

  return currentIndex;
}

export function nextSpatialFocusIndex({ currentIndex = 0, key, rects = [], count = rects.length }) {
  if (!count) {
    return -1;
  }

  const normalizedRects = rects.map((rect, fallbackIndex) => normalizeRect(rect, fallbackIndex)).filter(Boolean);
  const current = normalizedRects.find((rect) => rect.index === currentIndex);
  if (!current) {
    return nextBoardFocusIndex({ currentIndex, key, count });
  }

  const direction = {
    ArrowDown: "down",
    ArrowUp: "up",
    ArrowRight: "right",
    ArrowLeft: "left"
  }[key];

  if (!direction) {
    return currentIndex;
  }

  const candidates = normalizedRects
    .filter((rect) => rect.index !== current.index)
    .filter((rect) => isCandidateInDirection(current, rect, direction))
    .map((rect) => ({
      ...rect,
      score: scoreDirectionalCandidate(current, rect, direction)
    }))
    .sort((left, right) => left.score - right.score || left.index - right.index);

  return candidates[0]?.index ?? currentIndex;
}

export function imagePlaceholder(id, title = "Image") {
  return `![${String(title || "Image").replaceAll("]", ")")}](pinit://pin/${id}/image)`;
}

function normalizeRect(rect, fallbackIndex) {
  if (!rect) {
    return null;
  }

  const left = Number(rect.left);
  const right = Number(rect.right);
  const top = Number(rect.top);
  const bottom = Number(rect.bottom);
  const index = Number.isFinite(rect.index) ? rect.index : fallbackIndex;

  if (![left, right, top, bottom, index].every(Number.isFinite)) {
    return null;
  }

  return {
    index,
    left,
    right,
    top,
    bottom,
    centerX: left + (right - left) / 2,
    centerY: top + (bottom - top) / 2,
    height: bottom - top,
    width: right - left
  };
}

function isCandidateInDirection(current, candidate, direction) {
  if (direction === "down") {
    return candidate.centerY > current.centerY + 1;
  }
  if (direction === "up") {
    return candidate.centerY < current.centerY - 1;
  }

  if (!isSameVisualRow(current, candidate)) {
    return false;
  }

  if (direction === "right") {
    return candidate.centerX > current.centerX + 1;
  }
  if (direction === "left") {
    return candidate.centerX < current.centerX - 1;
  }

  return false;
}

function scoreDirectionalCandidate(current, candidate, direction) {
  if (direction === "down" || direction === "up") {
    return Math.abs(candidate.centerY - current.centerY) * 1000 + Math.abs(candidate.centerX - current.centerX);
  }

  return Math.abs(candidate.centerX - current.centerX) * 1000 + Math.abs(candidate.centerY - current.centerY);
}

function isSameVisualRow(current, candidate) {
  const overlap = Math.min(current.bottom, candidate.bottom) - Math.max(current.top, candidate.top);
  return overlap > Math.min(current.height, candidate.height) * 0.45;
}
