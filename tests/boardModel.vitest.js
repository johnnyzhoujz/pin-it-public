import { describe, expect, it } from "vitest";
import { editPin, filterBoardSnippets, nextBoardFocusIndex, nextSpatialFocusIndex, reorderProjectSnippets } from "../src/board/boardModel.js";

const snippets = [
  { id: "b", title: "Second", content: "OAuth callback", projectName: "Deck", contentType: "Text", order: 1 },
  { id: "a", title: "First", content: "Checkout error", projectName: "Deck", contentType: "Text", order: 0 },
  { id: "other", title: "Other", content: "Elsewhere", projectName: "Other", contentType: "Text", order: 0 }
];

describe("board model", () => {
  it("filters across title, content, project, and type", () => {
    expect(filterBoardSnippets(snippets, "oauth").map((snippet) => snippet.id)).toEqual(["b"]);
    expect(filterBoardSnippets(snippets, "other").map((snippet) => snippet.id)).toEqual(["other"]);
    expect(filterBoardSnippets(snippets, "").map((snippet) => snippet.id)).toEqual(["a", "other", "b"]);
  });

  it("renumbers reorder within the current project only", () => {
    const reordered = reorderProjectSnippets(snippets, { projectName: "Deck", sourceId: "b", targetId: "a" });
    expect(reordered.find((snippet) => snippet.id === "b").order).toBe(0);
    expect(reordered.find((snippet) => snippet.id === "a").order).toBe(1);
    expect(reordered.find((snippet) => snippet.id === "other").order).toBe(0);
  });

  it("edits text pins and marks the title as manually edited", () => {
    const [edited] = editPin([snippets[0]], "b", { title: "Better title", content: "```js\nconst ok = true;\n```" });
    expect(edited.title).toBe("Better title");
    expect(edited.contentType).toBe("Code");
    expect(edited.titleEditedAt).toBeTruthy();
  });

  it("edits only the title for image pins and regenerates the placeholder", () => {
    const [edited] = editPin(
      [{ id: "11111111-1111-4111-8111-111111111111", title: "Old", content: "old", contentType: "Image", imagePath: "images/11111111-1111-4111-8111-111111111111.png" }],
      "11111111-1111-4111-8111-111111111111",
      { title: "New screenshot", content: "ignored" }
    );
    expect(edited.content).toBe("![New screenshot](pinit://pin/11111111-1111-4111-8111-111111111111/image)");
    expect(edited.contentType).toBe("Image");
  });

  it("moves focus within board bounds", () => {
    expect(nextBoardFocusIndex({ currentIndex: 0, key: "ArrowDown", count: 3 })).toBe(1);
    expect(nextBoardFocusIndex({ currentIndex: 0, key: "ArrowUp", count: 3 })).toBe(0);
    expect(nextBoardFocusIndex({ currentIndex: 2, key: "ArrowDown", count: 3 })).toBe(2);
  });

  it("moves focus spatially across rendered card positions", () => {
    const rects = [
      { index: 0, left: 0, right: 100, top: 0, bottom: 100 },
      { index: 1, left: 120, right: 220, top: 0, bottom: 100 },
      { index: 2, left: 0, right: 100, top: 120, bottom: 220 },
      { index: 3, left: 120, right: 220, top: 120, bottom: 220 }
    ];

    expect(nextSpatialFocusIndex({ currentIndex: 0, key: "ArrowRight", rects })).toBe(1);
    expect(nextSpatialFocusIndex({ currentIndex: 0, key: "ArrowDown", rects })).toBe(2);
    expect(nextSpatialFocusIndex({ currentIndex: 3, key: "ArrowLeft", rects })).toBe(2);
    expect(nextSpatialFocusIndex({ currentIndex: 3, key: "ArrowUp", rects })).toBe(1);
  });
});
