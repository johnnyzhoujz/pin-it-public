import { describe, expect, it } from "vitest";
import { deriveFallbackTitle, excerptForSmartTitle, shouldApplyGeneratedTitle } from "../src/titles/smartTitles.js";

describe("smart title helpers", () => {
  it("creates synchronous fallback titles for text and images", () => {
    expect(deriveFallbackTitle({ content: "# OAuth callback bug\n\nDetails" })).toBe("OAuth callback bug");
    expect(deriveFallbackTitle({ content: "![Checkout error](pinit://pin/11111111-1111-4111-8111-111111111111/image)", contentType: "Image" })).toBe("Checkout error");
    expect(deriveFallbackTitle({ content: "", contentType: "Image" })).toBe("Image");
  });

  it("caps text excerpts and reads image alt text", () => {
    expect(excerptForSmartTitle({ content: "A".repeat(900) })).toHaveLength(700);
    expect(excerptForSmartTitle({ content: "![Checkout error](pinit://pin/11111111-1111-4111-8111-111111111111/image)", contentType: "Image" })).toBe("Checkout error");
  });

  it("blocks async overwrite after manual edit", () => {
    expect(shouldApplyGeneratedTitle({ title: "Fallback" }, "Fallback")).toBe(true);
    expect(shouldApplyGeneratedTitle({ title: "Manual", titleEditedAt: "2026-06-11T00:00:00.000Z" }, "Fallback")).toBe(false);
    expect(shouldApplyGeneratedTitle({ title: "Changed" }, "Fallback")).toBe(false);
  });
});
