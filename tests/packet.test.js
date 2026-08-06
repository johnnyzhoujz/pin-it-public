import assert from "node:assert/strict";
import {
  archivedSnippetsForProject,
  createSnippet,
  detectContentType,
  generateBuildPacket,
  normalizeProjectName,
  projectNames,
  snippetsForProject,
  sortSnippets
} from "../src/packet.js";
import { renderMarkdown } from "../src/markdown.js";
import {
  createExportPayload,
  durableStateSignature,
  loadStoredState,
  parseImportedState,
  saveStoredState,
  serializeExportPayload,
  storageSummary
} from "../src/storage.js";

const snippets = [
  {
    id: "later",
    title: "Second useful note",
    content: "Use the selected pins as source material.",
    contentType: "Text",
    projectName: "Deck",
    order: 2,
    createdAt: "2026-06-06T18:02:00.000Z"
  },
  {
    id: "other-project",
    title: "Different artifact",
    content: "This belongs elsewhere.",
    contentType: "Text",
    projectName: "Landing page",
    order: 1,
    createdAt: "2026-06-06T18:01:00.000Z"
  },
  {
    id: "first",
    title: "First useful note",
    content: "Save friction should be almost zero.",
    contentType: "Text",
    projectName: "Deck",
    order: 0,
    createdAt: "2026-06-06T18:00:00.000Z"
  },
  {
    id: "archived",
    title: "Hidden note",
    content: "This was archived.",
    contentType: "Text",
    projectName: "Deck",
    archivedAt: "2026-06-06T18:03:00.000Z",
    order: 3,
    createdAt: "2026-06-06T18:03:00.000Z"
  }
];

assert.equal(normalizeProjectName(""), "Untitled artifact");
assert.deepEqual(projectNames(snippets, "Deck"), ["Deck", "Landing page"]);
assert.deepEqual(projectNames(snippets, "Deck", { "Landing page": { archivedAt: "2026-06-06T18:04:00.000Z" } }), [
  "Deck",
  "Landing page"
]);
assert.deepEqual(
  snippetsForProject(snippets, "Deck").map((snippet) => snippet.id),
  ["first", "later"]
);
assert.deepEqual(
  archivedSnippetsForProject(snippets, "Deck").map((snippet) => snippet.id),
  ["archived"]
);
assert.deepEqual(
  sortSnippets(snippets).map((snippet) => snippet.id),
  ["first", "other-project", "later", "archived"]
);

assert.deepEqual(
  sortSnippets([
    { id: "captured-first", order: 1, createdAt: "2026-06-06T18:00:00.000Z" },
    { id: "moved-earlier", order: 0, createdAt: "2026-06-06T19:00:00.000Z" }
  ]).map((snippet) => snippet.id),
  ["moved-earlier", "captured-first"]
);

assert.equal(detectContentType("```js\nconst saved = true;\n```"), "Code");
assert.equal(detectContentType("https://example.com/image.png"), "Image");
assert.equal(detectContentType("## Heading\n\n- Item"), "Markdown");
assert.equal(detectContentType("plain wording worth pinning"), "Text");

const packet = generateBuildPacket({
  snippets: snippetsForProject(snippets, "Deck"),
  projectName: "Deck",
  selectedIds: ["first", "later"],
  metaPrompt: "Turn these pins into a concise build request."
});

assert.match(packet, /# Use These Pins/);
assert.match(packet, /Project \/ artifact: Deck/);
assert.match(packet, /saved material that should shape the next response/);
assert.match(packet, /Turn these pins into a concise build request\./);
assert.match(packet, /### 1\. First useful note/);
assert.match(packet, /### 2\. Second useful note/);
assert.doesNotMatch(packet, /Different artifact/);
assert.doesNotMatch(packet, /Hidden note/);

const reorderedPacket = generateBuildPacket({
  snippets: [
    {
      id: "captured-first",
      title: "Captured first",
      content: "This was captured first.",
      contentType: "Text",
      projectName: "Deck",
      order: 1,
      createdAt: "2026-06-06T18:00:00.000Z"
    },
    {
      id: "moved-earlier",
      title: "Moved earlier",
      content: "This should lead the packet.",
      contentType: "Text",
      projectName: "Deck",
      order: 0,
      createdAt: "2026-06-06T19:00:00.000Z"
    }
  ],
  projectName: "Deck",
  selectedIds: ["captured-first", "moved-earlier"]
});
assert.match(reorderedPacket, /### 1\. Moved earlier[\s\S]*### 2\. Captured first/);

const defaultPacket = generateBuildPacket({
  snippets: snippetsForProject(snippets, "Deck"),
  projectName: "Deck",
  selectedIds: ["first"]
});
assert.match(defaultPacket, /accepted working context/);
assert.match(defaultPacket, /instead of restarting from scratch/);

const allByDefaultPacket = generateBuildPacket({
  snippets: snippetsForProject(snippets, "Deck"),
  projectName: "Deck"
});
assert.match(allByDefaultPacket, /First useful note/);
assert.match(allByDefaultPacket, /Second useful note/);

const explicitlyEmptyPacket = generateBuildPacket({
  snippets: snippetsForProject(snippets, "Deck"),
  projectName: "Deck",
  selectedIds: []
});
assert.match(explicitlyEmptyPacket, /No pinned material selected\./);
assert.doesNotMatch(explicitlyEmptyPacket, /First useful note/);

const created = createSnippet({ content: "function saveKeep() {}", projectName: "Prototype" }, 4);
assert.equal(created.projectName, "Prototype");
assert.equal(created.contentType, "Code");
assert.equal(created.title, "function saveKeep() {}");

const richCreated = createSnippet(
  {
    clipboardFormats: {
      html: "<table><tr><th>A</th></tr><tr><td>1</td></tr></table>",
      text: "A\n1"
    },
    content: "A\n1",
    contentType: "Text",
    projectName: "Prototype"
  },
  5
);
assert.equal(richCreated.clipboardFormats.html.includes("<table>"), true);
assert.equal(richCreated.clipboardFormats.text, "A\n1");

const renderedTable = renderMarkdown("| A | B |\n| - | - |\n| 1 | 2 |");
assert.match(renderedTable, /<table>/);
assert.match(renderedTable, /<td>1<\/td>/);

const renderedRawHtmlTable = renderMarkdown("Before\n\n<table><tr><th>Rune</th></tr><tr><td>Approved</td></tr></table>\n\nAfter");
assert.match(renderedRawHtmlTable, /Before/);
assert.match(renderedRawHtmlTable, /<table>/);
assert.match(renderedRawHtmlTable, /<td>Approved<\/td>/);
assert.match(renderedRawHtmlTable, /After/);

const renderedTsvTable = renderMarkdown("Rune\tMeaning\nApproved\tHigh");
assert.match(renderedTsvTable, /<table>/);
assert.match(renderedTsvTable, /<td>High<\/td>/);

const renderedClipboardTable = renderMarkdown("Signal\n\nEvidence\n\nConfidence\n\nAdoption\n\nMeasured", {
  clipboardFormats: {
    html: "<div><table><tr><th>Signal</th><th>Evidence</th><th>Confidence</th></tr><tr><td>Adoption</td><td>Measured</td><td></td></tr></table></div>"
  }
});
assert.match(renderedClipboardTable, /<table>/);
assert.match(renderedClipboardTable, /<th>Signal<\/th>/);
assert.match(renderedClipboardTable, /<td>Adoption<\/td>/);

const renderedLooseClipboardTable = renderMarkdown(`Metric

Use

Weekly transaction volume

Shows workflow scale


Actions per session

Shows depth

Average age of unresolved tasks

Shows operational continuity

Time-to-resolution

Shows efficiency

Public Tabs efficiency stats

Use only as company/workflow context, not your direct impact unless directly attributable`);
assert.match(renderedLooseClipboardTable, /<table>/);
assert.match(renderedLooseClipboardTable, /<th>Metric<\/th>/);
assert.match(renderedLooseClipboardTable, /<td>Weekly transaction volume<\/td>/);
assert.match(renderedLooseClipboardTable, /<td>Shows workflow scale<\/td>/);

const imageDataUrl = `data:image/png;base64,${"A".repeat(20000)}`;
const renderedImageOnlyPin = renderMarkdown(`![Clipboard image](${imageDataUrl})`, {
  clipboardFormats: { imageDataUrl }
});
assert.match(renderedImageOnlyPin, /^<p><img src="data:image\/png;base64,A+/);
assert.doesNotMatch(renderedImageOnlyPin, /<a href=/);

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
  detailId: null,
  themePreference: "system",
  selectedIdsByProject: {},
  snippets: []
};

const storageState = {
  ...defaultState,
  projectName: "Deck",
  view: "build",
  panelOpen: true,
  copied: "raw",
  detailId: "first",
  metaPrompt: "Use these.",
  metaPromptsByProject: { Deck: "Use these." },
  projects: { "Old deck": { archivedAt: "2026-06-06T18:05:00.000Z" } },
  themePreference: "dark",
  selectedIdsByProject: { Deck: ["first"] },
  snippets
};

const memoryStorage = new Map();
const storageAdapter = {
  getItem: (key) => memoryStorage.get(key) || null,
  setItem: (key, value) => memoryStorage.set(key, value)
};

saveStoredState(storageState, storageAdapter);
const restored = loadStoredState(defaultState, storageAdapter);
assert.equal(restored.projectName, "Deck");
assert.equal(restored.metaPromptsByProject.Deck, "Use these.");
assert.equal(restored.view, "play");
assert.equal(restored.panelOpen, false);
assert.equal(restored.copied, null);
assert.equal(restored.detailId, null);
assert.equal(restored.themePreference, "dark");
assert.equal(restored.snippets.length, snippets.length);
assert.equal(
  durableStateSignature(storageState),
  durableStateSignature({ ...storageState, view: "build", panelOpen: true, copied: "first", detailId: "first" })
);
assert.notEqual(durableStateSignature(storageState), durableStateSignature({ ...storageState, themePreference: "light" }));

const exportPayload = createExportPayload(storageState);
assert.equal(exportPayload.app, "Pin It");
assert.equal(exportPayload.schemaVersion, 1);
assert.equal(exportPayload.data.projectName, "Deck");
assert.equal(exportPayload.data.metaPromptsByProject.Deck, "Use these.");
assert.equal(exportPayload.data.projects["Old deck"].archivedAt, "2026-06-06T18:05:00.000Z");
assert.equal(exportPayload.data.themePreference, "dark");
assert.equal(exportPayload.data.snippets.length, snippets.length);

const imported = parseImportedState(serializeExportPayload(storageState), defaultState);
assert.equal(imported.projectName, "Deck");
assert.equal(imported.themePreference, "dark");
assert.equal(imported.projects["Old deck"].archivedAt, "2026-06-06T18:05:00.000Z");

const importedInvalidTheme = parseImportedState(JSON.stringify({ data: { projectName: "Deck", themePreference: "sepia" } }), defaultState);
assert.equal(importedInvalidTheme.themePreference, "system");
assert.equal(imported.metaPromptsByProject.Deck, "Use these.");
const importedLegacyPrompt = parseImportedState(JSON.stringify({ data: { projectName: "Legacy deck", metaPrompt: "Legacy prompt." } }), defaultState);
assert.equal(importedLegacyPrompt.metaPromptsByProject["Legacy deck"], "Legacy prompt.");
assert.equal(importedLegacyPrompt.metaPromptsByProject.Deck, undefined);
const importedClearedPrompt = parseImportedState(
  JSON.stringify({ data: { projectName: "Deck", metaPrompt: "Legacy prompt.", metaPromptsByProject: {} } }),
  defaultState
);
assert.equal(importedClearedPrompt.metaPromptsByProject.Deck, undefined);
assert.equal(imported.view, "play");
assert.equal(imported.snippets.length, snippets.length);

assert.deepEqual(storageSummary(storageState), {
  active: 3,
  archived: 1,
  projects: 3,
  total: 4
});

console.log("packet tests passed");
