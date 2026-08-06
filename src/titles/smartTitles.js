export const SMART_TITLE_EXCERPT_LIMIT = 700;

export function deriveFallbackTitle({ content = "", contentType = "", title = "" } = {}) {
  if (title?.trim()) {
    return cleanTitle(title);
  }

  const imageAlt = String(content).match(/^!\[([^\]]*)]\((data:image\/[^)]+|pinit:\/\/pin\/[^)]+)\)$/i)?.[1]?.trim();
  if (contentType === "Image" || imageAlt) {
    return cleanTitle(imageAlt || "Image");
  }

  const firstLine = String(content)
    .split("\n")
    .map((line) => line.replace(/^#+\s*/, "").replace(/^```[a-zA-Z0-9_-]*\s*$/, "").trim())
    .find(Boolean);

  if (!firstLine) {
    return "Untitled pin";
  }

  return cleanTitle(firstLine);
}

export function excerptForSmartTitle({ content = "", contentType = "" } = {}) {
  if (contentType === "Image") {
    return imageAltTextForSmartTitle(content);
  }

  return String(content).replace(/\s+/g, " ").trim().slice(0, SMART_TITLE_EXCERPT_LIMIT);
}

export function imageAltTextForSmartTitle(content = "") {
  return String(content)
    .match(/^!\[([^\]]*)]\((data:image\/[^)]+|pinit:\/\/pin\/[^)]+)\)$/i)?.[1]
    ?.replace(/\s+/g, " ")
    .trim()
    .slice(0, SMART_TITLE_EXCERPT_LIMIT) || "";
}

export function shouldApplyGeneratedTitle(pin, originalFallbackTitle) {
  return Boolean(pin && !pin.titleEditedAt && pin.title === originalFallbackTitle);
}

export function cleanTitle(value) {
  const clean = String(value || "").replace(/\s+/g, " ").trim();
  if (!clean) {
    return "Untitled pin";
  }
  return clean.length > 72 ? `${clean.slice(0, 69)}...` : clean;
}
