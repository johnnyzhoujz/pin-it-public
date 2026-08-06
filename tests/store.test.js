import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  completeStorageCutover,
  migrateStoreImages,
  migrateStoreImagesSafely,
  parseStorePayload,
  readStoreText,
  removeDeletedPinImages,
  removedPinImageIds,
  stringifyStorePayload
} from "../src/store/files.js";
import { resolvePinImagePath } from "../src/store/paths.js";
import { createWriteQueue } from "../src/store/writeQueue.js";

const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pinit-store-"));

function payload(snippets, extra = {}) {
  return stringifyStorePayload({
    app: "Pin It",
    schemaVersion: 1,
    exportedAt: "2026-06-11T00:00:00.000Z",
    ...extra,
    data: {
      projectName: "Deck",
      draftContent: "",
      metaPrompt: "",
      metaPromptsByProject: {},
      projects: {},
      selectedIdsByProject: {},
      themePreference: "system",
      snippets
    }
  });
}

function pin(id, updatedAt) {
  return {
    id,
    title: id,
    content: `${id} content`,
    contentType: "Text",
    projectName: "Deck",
    order: 0,
    createdAt: updatedAt,
    updatedAt
  };
}

async function storePath(name) {
  const dir = path.join(tempRoot, name);
  await fs.mkdir(dir, { recursive: true });
  return path.join(dir, "keeps.json");
}

const newerLocalStore = await storePath("newer-local");
await fs.writeFile(newerLocalStore, payload([pin("native", "2026-06-10T00:00:00.000Z")]));
const newerLocal = await completeStorageCutover({
  storePath: newerLocalStore,
  now: "2026-06-11T00:00:00.000Z",
  localStoreText: payload([pin("local", "2026-06-11T00:00:00.000Z")])
});
assert.equal(newerLocal.action, "imported-local-storage");
assert.equal(parseStorePayload(newerLocal.text).data.snippets[0].id, "local");
assert.equal(parseStorePayload(newerLocal.text).cutoverCompleted, "2026-06-11T00:00:00.000Z");
assert.equal((await readStoreText(`${newerLocalStore}.pre-cutover.bak`)).includes("native"), true);

const tieStore = await storePath("tie-keeps");
await fs.writeFile(tieStore, payload([pin("native-tie", "2026-06-11T00:00:00.000Z")]));
const tie = await completeStorageCutover({
  storePath: tieStore,
  now: "2026-06-11T01:00:00.000Z",
  localStoreText: payload([pin("local-tie", "2026-06-11T00:00:00.000Z")])
});
assert.equal(tie.action, "kept-keeps-json");
assert.equal(parseStorePayload(tie.text).data.snippets[0].id, "native-tie");
await assert.rejects(fs.access(`${tieStore}.pre-cutover.bak`));

const emptyNativeStore = await storePath("empty-native");
const emptyImport = await completeStorageCutover({
  storePath: emptyNativeStore,
  now: "2026-06-11T02:00:00.000Z",
  localStoreText: payload([pin("local-only", "2026-06-10T00:00:00.000Z")])
});
assert.equal(emptyImport.action, "imported-local-storage");
assert.equal(parseStorePayload(emptyImport.text).data.snippets[0].id, "local-only");

const idempotent = await completeStorageCutover({
  storePath: emptyNativeStore,
  now: "2026-06-11T03:00:00.000Z",
  localStoreText: payload([pin("newer-but-ignored", "2026-06-12T00:00:00.000Z")])
});
assert.equal(idempotent.action, "already-completed");
assert.equal(parseStorePayload(idempotent.text).data.snippets[0].id, "local-only");

const imageStore = await storePath("image-migration");
const imageId = "11111111-1111-4111-8111-111111111111";
const imageDataUrl = `data:image/png;base64,${Buffer.from("image-bytes").toString("base64")}`;
await fs.writeFile(
  imageStore,
  payload([
    {
      ...pin(imageId, "2026-06-11T00:00:00.000Z"),
      title: "Checkout error",
      content: `![Old image](${imageDataUrl})`,
      contentType: "Image",
      clipboardFormats: { imageDataUrl, text: "ignored" }
    }
  ])
);
const migrated = await migrateStoreImages({
  storePath: imageStore,
  now: "2026-06-11T04:00:00.000Z"
});
const migratedPayload = parseStorePayload(migrated.text);
assert.equal(migrated.migrated, 1);
assert.equal(migratedPayload.data.snippets[0].imagePath, `images/${imageId}.png`);
assert.equal(migratedPayload.data.snippets[0].content, `![Checkout error](pinit://pin/${imageId}/image)`);
assert.equal(migratedPayload.data.snippets[0].clipboardFormats.imageDataUrl, undefined);
assert.equal(await fs.readFile(resolvePinImagePath(imageId, { env: { PINIT_STORE_PATH: imageStore } }), "utf8"), "image-bytes");
assert.equal((await readStoreText(`${imageStore}.bak`)).includes(imageDataUrl), true);

const malformedStore = await storePath("malformed-json");
const malformedText = '{"data":{"snippets":[';
await fs.writeFile(malformedStore, malformedText);
const malformedMigration = await migrateStoreImagesSafely({ storePath: malformedStore });
assert.equal(malformedMigration.failed, true);
assert.equal(malformedMigration.fatal, true);
assert.equal(malformedMigration.text, malformedText);
assert.equal(await readStoreText(malformedStore), malformedText);

const recoverableStore = await storePath("recoverable-image-migration");
const invalidImagePayload = payload([
  {
    ...pin("legacy-image-id", "2026-06-11T00:00:00.000Z"),
    content: `![Legacy image](${imageDataUrl})`,
    contentType: "Image"
  }
]);
await fs.writeFile(recoverableStore, invalidImagePayload);
const recoverableMigration = await migrateStoreImagesSafely({ storePath: recoverableStore });
assert.equal(recoverableMigration.failed, true);
assert.equal(recoverableMigration.fatal, false);
assert.equal(recoverableMigration.text, invalidImagePayload);
assert.equal(await readStoreText(recoverableStore), invalidImagePayload);

const removedImageStore = await storePath("removed-image");
const removedImageId = "22222222-2222-4222-8222-222222222222";
const retainedImageId = "33333333-3333-4333-8333-333333333333";
const previousImages = payload([
  { ...pin(removedImageId, "2026-06-11T00:00:00.000Z"), contentType: "Image", imagePath: `images/${removedImageId}.png` },
  { ...pin(retainedImageId, "2026-06-11T00:00:00.000Z"), contentType: "Image", imagePath: `images/${retainedImageId}.png` }
]);
const nextImages = payload([
  { ...pin(retainedImageId, "2026-06-11T00:00:00.000Z"), contentType: "Image", imagePath: `images/${retainedImageId}.png` }
]);
assert.deepEqual(removedPinImageIds(previousImages, nextImages), [removedImageId]);
const removedImagePath = resolvePinImagePath(removedImageId, { env: { PINIT_STORE_PATH: removedImageStore } });
const retainedImagePath = resolvePinImagePath(retainedImageId, { env: { PINIT_STORE_PATH: removedImageStore } });
await fs.mkdir(path.dirname(removedImagePath), { recursive: true });
await fs.writeFile(removedImagePath, "remove-me");
await fs.writeFile(retainedImagePath, "keep-me");
const cleanup = await removeDeletedPinImages({
  previousText: previousImages,
  nextText: nextImages,
  storePath: removedImageStore
});
assert.deepEqual(cleanup, { ids: [removedImageId], failed: 0 });
await assert.rejects(fs.access(removedImagePath));
assert.equal(await fs.readFile(retainedImagePath, "utf8"), "keep-me");
assert.deepEqual(removedPinImageIds("not json", nextImages), []);

assert.throws(() => resolvePinImagePath("../bad", { env: { PINIT_STORE_PATH: imageStore } }), /Invalid pin id/);

const enqueue = createWriteQueue();
const writeOrder = [];
const queued = [
  enqueue(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
    writeOrder.push("first");
    return "first";
  }),
  enqueue(async () => {
    writeOrder.push("second");
    return "second";
  })
];
assert.deepEqual(await Promise.all(queued), ["first", "second"]);
assert.deepEqual(writeOrder, ["first", "second"]);

await fs.rm(tempRoot, { recursive: true, force: true });

console.log("store tests passed");
