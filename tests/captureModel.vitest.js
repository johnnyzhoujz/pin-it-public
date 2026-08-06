import { describe, expect, it } from "vitest";
import {
  createFileBackedImageCapturePayload,
  imageDataUrlFromCapturePayload,
  imageDataUrlFromMarkdown
} from "../src/sidecar/captureModel.js";

describe("captureModel", () => {
  it("extracts image data URLs from markdown and capture payloads", () => {
    const imageDataUrl = "data:image/png;base64,aW1hZ2U=";

    expect(imageDataUrlFromMarkdown(`![Clipboard image](${imageDataUrl})`)).toBe(imageDataUrl);
    expect(imageDataUrlFromCapturePayload({ clipboardFormats: { imageDataUrl } })).toBe(imageDataUrl);
  });

  it("converts clipboard image captures to file-backed pinit placeholders", () => {
    const payload = createFileBackedImageCapturePayload(
      {
        clipboardFormats: {
          html: "<img>",
          imageDataUrl: "data:image/png;base64,aW1hZ2U="
        },
        content: "![Screenshot preview](data:image/png;base64,aW1hZ2U=)",
        source: "selection"
      },
      {
        imagePath: "images/11111111-1111-4111-8111-111111111111.png",
        pinId: "11111111-1111-4111-8111-111111111111"
      }
    );

    expect(payload).toMatchObject({
      id: "11111111-1111-4111-8111-111111111111",
      title: "Screenshot preview",
      content: "![Screenshot preview](pinit://pin/11111111-1111-4111-8111-111111111111/image)",
      contentType: "Image",
      imagePath: "images/11111111-1111-4111-8111-111111111111.png",
      clipboardFormats: { html: "<img>" }
    });
    expect(JSON.stringify(payload)).not.toContain("base64");
  });
});
