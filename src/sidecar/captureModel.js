export function imageDataUrlFromMarkdown(value = "") {
  const match = value.trim().match(/^!\[[^\]]*]\((data:image\/[a-z0-9.+-]+;base64,[^)]+)\)$/i);
  return match?.[1] || "";
}

export function imageDataUrlFromCapturePayload(payload = {}) {
  return payload?.clipboardFormats?.imageDataUrl || imageDataUrlFromMarkdown(payload?.content || "");
}

export function createFileBackedImageCapturePayload(payload = {}, { imagePath, pinId }) {
  const title = imageAltFromMarkdown(payload.content) || payload.title || "Clipboard image";
  const clipboardFormats = removeImageDataUrl(payload.clipboardFormats);
  const { clipboardFormats: _clipboardFormats, ...rest } = payload;

  return {
    ...rest,
    id: pinId,
    title,
    content: `![${escapeMarkdownAlt(title)}](pinit://pin/${pinId}/image)`,
    contentType: "Image",
    imagePath,
    ...(clipboardFormats ? { clipboardFormats } : {})
  };
}

function imageAltFromMarkdown(value = "") {
  const match = value.trim().match(/^!\[([^\]]*)]\((?:data:image\/[a-z0-9.+-]+;base64,[^)]+|pinit:\/\/pin\/[0-9a-f-]{36}\/image)\)$/i);
  return match?.[1]?.trim() || "";
}

function removeImageDataUrl(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const { imageDataUrl: _imageDataUrl, ...rest } = value;
  const clean = Object.fromEntries(
    Object.entries(rest).filter(([_key, entry]) => (typeof entry === "string" ? entry.trim() : entry))
  );
  return Object.keys(clean).length ? clean : null;
}

function escapeMarkdownAlt(value = "") {
  return String(value).replace(/]/g, "\\]").trim() || "Clipboard image";
}
