import os from "node:os";
import path from "node:path";

const PIN_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function resolveStorePath({ env = process.env, homeDir = os.homedir() } = {}) {
  if (env.PINIT_STORE_PATH?.trim()) {
    return path.resolve(env.PINIT_STORE_PATH);
  }

  if (process.platform === "darwin") {
    return path.join(homeDir, "Library", "Application Support", "Keep That", "keeps.json");
  }

  const appData = env.APPDATA || path.join(homeDir, ".config");
  return path.join(appData, "Keep That", "keeps.json");
}

export function resolveStoreDir(options = {}) {
  return path.dirname(resolveStorePath(options));
}

export function relativePinImagePath(id) {
  assertValidPinId(id);
  return path.join("images", `${id}.png`);
}

export function resolvePinImagePath(id, options = {}) {
  const storeDir = resolveStoreDir(options);
  const imagesDir = path.join(storeDir, "images");
  const resolved = path.resolve(storeDir, relativePinImagePath(id));
  const confinedRoot = path.resolve(imagesDir);

  if (resolved !== confinedRoot && !resolved.startsWith(`${confinedRoot}${path.sep}`)) {
    throw new Error("Pin image path escapes the images directory.");
  }

  return resolved;
}

export function assertValidPinId(id) {
  if (!PIN_ID_PATTERN.test(String(id || ""))) {
    throw new Error("Invalid pin id.");
  }
}
