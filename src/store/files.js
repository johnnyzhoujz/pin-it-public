import fs from "node:fs/promises";
import path from "node:path";
import {
  assertValidPinId,
  relativePinImagePath,
  resolvePinImagePath,
  resolveStorePath
} from "./paths.js";

export { resolvePinImagePath, resolveStorePath };

export async function readStoreText(storePath = resolveStorePath()) {
  try {
    return await fs.readFile(storePath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      return "";
    }
    throw error;
  }
}

export async function atomicWriteText(filePath, text) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`);
  await fs.writeFile(tempPath, text, "utf8");
  await fs.rename(tempPath, filePath);
}

export async function completeStorageCutover({
  localStoreText = "",
  now = new Date().toISOString(),
  storePath = resolveStorePath()
} = {}) {
  const existingText = await readStoreText(storePath);
  const existingPayload = parseStorePayload(existingText);

  if (existingPayload?.cutoverCompleted) {
    return {
      action: "already-completed",
      text: existingText
    };
  }

  const localPayload = parseStorePayload(localStoreText);
  const existingData = existingPayload ? storeData(existingPayload) : null;
  const localData = localPayload ? storeData(localPayload) : null;
  const existingHasPins = hasPins(existingData);
  const localHasPins = hasPins(localData);
  const shouldImport =
    localHasPins &&
    (!existingHasPins || maxUpdatedAt(localData.snippets) > maxUpdatedAt(existingData.snippets));
  const chosenPayload = shouldImport
    ? withCutoverCompleted(payloadFromData(localData, localPayload), now)
    : withCutoverCompleted(existingPayload || payloadFromData(localData, localPayload), now);

  if (!chosenPayload) {
    return {
      action: "empty",
      text: ""
    };
  }

  if (shouldImport && existingText.trim()) {
    await fs.copyFile(storePath, `${storePath}.pre-cutover.bak`);
  }

  const nextText = stringifyStorePayload(chosenPayload);
  await atomicWriteText(storePath, nextText);

  return {
    action: shouldImport ? "imported-local-storage" : "kept-keeps-json",
    text: nextText
  };
}

export async function migrateStoreImages({
  now = new Date().toISOString(),
  storePath = resolveStorePath()
} = {}) {
  const originalText = await readStoreText(storePath);
  if (!originalText.trim()) {
    return { migrated: 0, text: "" };
  }

  const pendingImages = [];
  const migration = migrateImageDataUrlsInText(originalText, {
    now,
    writeImage: (image) => pendingImages.push(image)
  });
  if (!migration.migrated) {
    return { migrated: 0, text: originalText };
  }

  for (const image of pendingImages) {
    const absoluteImagePath = resolvePinImagePath(image.pinId, { env: { PINIT_STORE_PATH: storePath } });
    await fs.mkdir(path.dirname(absoluteImagePath), { recursive: true });
    await fs.writeFile(absoluteImagePath, image.buffer);
  }

  await fs.copyFile(storePath, `${storePath}.bak`);
  await atomicWriteText(storePath, migration.text);
  return migration;
}

export async function migrateStoreImagesSafely({ storePath = resolveStorePath(), ...options } = {}) {
  try {
    const result = await migrateStoreImages({ ...options, storePath });
    return { ...result, failed: false, fatal: false, storePath };
  } catch (error) {
    let text = "";
    let readFailed = false;

    try {
      text = await readStoreText(storePath);
    } catch {
      readFailed = true;
    }

    return {
      migrated: 0,
      text,
      failed: true,
      fatal: error instanceof SyntaxError || readFailed,
      errorName: error?.name || "Error",
      errorMessage: error?.message || String(error),
      storePath
    };
  }
}

export function removedPinImageIds(previousText, nextText) {
  try {
    const previousIds = referencedPinImageIds(parseStorePayload(previousText));
    const nextIds = referencedPinImageIds(parseStorePayload(nextText));
    return [...previousIds].filter((id) => !nextIds.has(id));
  } catch {
    return [];
  }
}

export async function removeDeletedPinImages({
  previousText = "",
  nextText = "",
  storePath = resolveStorePath()
} = {}) {
  const ids = removedPinImageIds(previousText, nextText);
  const results = await Promise.allSettled(
    ids.map((id) => fs.rm(resolvePinImagePath(id, { env: { PINIT_STORE_PATH: storePath } }), { force: true }))
  );

  return {
    ids,
    failed: results.filter((result) => result.status === "rejected").length
  };
}

export function migrateImageDataUrlsInText(text, { now = new Date().toISOString(), writeImage } = {}) {
  const payload = parseStorePayload(text);
  if (!payload) {
    return { migrated: 0, text };
  }

  const data = storeData(payload);
  const snippets = Array.isArray(data.snippets) ? data.snippets : [];
  let migrated = 0;
  const nextSnippets = snippets.map((snippet) => {
    const dataUrl = imageDataUrlForSnippet(snippet);
    if (!dataUrl || snippet.imagePath) {
      return snippet;
    }

    const imagePath = relativePinImagePath(snippet.id);
    writeImage?.({ buffer: bufferFromImageDataUrl(dataUrl), imagePath, pinId: snippet.id });
    const clipboardFormats = { ...(snippet.clipboardFormats || {}) };
    delete clipboardFormats.imageDataUrl;
    migrated += 1;
    return {
      ...snippet,
      content: imagePlaceholder(snippet),
      contentType: "Image",
      imagePath,
      ...(Object.keys(clipboardFormats).length ? { clipboardFormats } : {})
    };
  });

  if (!migrated) {
    return { migrated: 0, text };
  }

  return {
    migrated,
    text: stringifyStorePayload({
      ...payload,
      exportedAt: now,
      data: {
        ...data,
        snippets: nextSnippets
      }
    })
  };
}

export function parseStorePayload(text) {
  if (!text || !String(text).trim()) {
    return null;
  }

  const parsed = JSON.parse(text);
  if (parsed?.data && typeof parsed.data === "object") {
    return parsed;
  }

  return payloadFromData(parsed, parsed);
}

export function stringifyStorePayload(payload) {
  return `${JSON.stringify(payload, null, 2)}\n`;
}

function payloadFromData(data, source = {}) {
  if (!data || typeof data !== "object") {
    return null;
  }

  return {
    app: source.app || "Pin It",
    schemaVersion: source.schemaVersion || 1,
    exportedAt: source.exportedAt || new Date().toISOString(),
    ...(source.cutoverCompleted ? { cutoverCompleted: source.cutoverCompleted } : {}),
    data: {
      projectName: data.projectName,
      draftContent: data.draftContent || "",
      metaPrompt: data.metaPrompt || "",
      metaPromptsByProject: data.metaPromptsByProject || {},
      projects: data.projects || {},
      soundMuted: Boolean(data.soundMuted),
      smartTitlesEnabled: Boolean(data.smartTitlesEnabled),
      themePreference: data.themePreference || "system",
      selectedIdsByProject: data.selectedIdsByProject || {},
      snippets: Array.isArray(data.snippets) ? data.snippets : []
    }
  };
}

function withCutoverCompleted(payload, now) {
  return payload ? { ...payload, cutoverCompleted: now } : null;
}

function storeData(payload) {
  return payload?.data && typeof payload.data === "object" ? payload.data : payload || {};
}

function hasPins(data) {
  return Array.isArray(data?.snippets) && data.snippets.length > 0;
}

function maxUpdatedAt(snippets = []) {
  return snippets.reduce((max, snippet) => {
    const timestamp = Date.parse(snippet.updatedAt || snippet.createdAt || "") || 0;
    return Math.max(max, timestamp);
  }, 0);
}

function imageDataUrlForSnippet(snippet) {
  const contentMatch = String(snippet?.content || "").match(/!\[[^\]]*]\((data:image\/[^)]+)\)/);
  return snippet?.clipboardFormats?.imageDataUrl || contentMatch?.[1] || "";
}

function bufferFromImageDataUrl(value) {
  const match = String(value).match(/^data:image\/[a-z0-9.+-]+;base64,([\s\S]+)$/i);
  if (!match) {
    throw new Error("Invalid image data URL.");
  }
  return Buffer.from(match[1], "base64");
}

function imagePlaceholder(snippet) {
  const title = String(snippet.title || "Image").replaceAll("]", ")");
  return `![${title}](pinit://pin/${snippet.id}/image)`;
}

function referencedPinImageIds(payload) {
  const snippets = Array.isArray(storeData(payload).snippets) ? storeData(payload).snippets : [];
  const ids = new Set();

  for (const snippet of snippets) {
    if (!snippet?.imagePath) {
      continue;
    }

    try {
      assertValidPinId(snippet.id);
      ids.add(snippet.id);
    } catch {
      // Invalid legacy identifiers are never resolved or deleted.
    }
  }

  return ids;
}
