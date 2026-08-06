const OpenAI = require("openai");

const DEFAULT_OPENAI_MODEL = "gpt-5.6-luna";
const MAX_TITLE_EXCERPT_CHARS = 700;

function openAIModel() {
  return (process.env.KEEP_THAT_OPENAI_MODEL || DEFAULT_OPENAI_MODEL).trim();
}

function openAIStatus({ configured = Boolean(process.env.OPENAI_API_KEY?.trim()), source = "", errorCode = "" } = {}) {
  const envConfigured = Boolean(process.env.OPENAI_API_KEY?.trim());
  return {
    provider: "openai",
    configured: envConfigured || configured,
    model: openAIModel(),
    source: envConfigured ? "environment" : source,
    errorCode: envConfigured || configured ? "" : errorCode
  };
}

async function generatePinTitle({ content = "", contentType = "Text", fallbackTitle = "", imageDataUrl = "" } = {}, { apiKey = "" } = {}) {
  const cleanApiKey = apiKey.trim() || process.env.OPENAI_API_KEY?.trim() || "";
  if (!cleanApiKey) {
    return {
      ok: false,
      code: "not_configured",
      message: "Smart titles need an OpenAI API key."
    };
  }

  const isImage = contentType === "Image";
  const cleanImageDataUrl = String(imageDataUrl || "").trim();
  if (isImage && !cleanImageDataUrl.startsWith("data:image/")) {
    return {
      ok: false,
      code: "missing_image",
      message: "Smart title skipped: screenshot image was unavailable."
    };
  }

  const excerpt = String(content || "").replace(/\s+/g, " ").trim().slice(0, MAX_TITLE_EXCERPT_CHARS);
  if (!excerpt && !isImage) {
    return {
      ok: false,
      code: "empty_excerpt",
      message: "No text excerpt available for smart title."
    };
  }

  const client = new OpenAI({ apiKey: cleanApiKey });
  let response;
  try {
    response = await client.responses.create({
      model: openAIModel(),
      store: false,
      reasoning: { effort: "low" },
      text: { verbosity: "low" },
      instructions: [
        "Write a short plain-English title for a saved Pin It snippet.",
        "Return only the title text. No quotes, markdown, bullets, or labels.",
        "Use 4-10 words when possible. Preserve concrete nouns from the text or image."
      ].join("\n"),
      input: buildTitleInput({ excerpt, fallbackTitle, imageDataUrl: cleanImageDataUrl }),
      max_output_tokens: 60
    });
  } catch (error) {
    return {
      ok: false,
      code: error?.code || error?.type || "provider_error",
      message: providerErrorMessage(error)
    };
  }

  const text = (response.output_text || "").replace(/\s+/g, " ").trim();
  if (!text) {
    return {
      ok: false,
      code: "empty_response",
      message: "Smart title response was empty."
    };
  }

  return {
    ok: true,
    text: text.length > 72 ? `${text.slice(0, 69)}...` : text,
    model: openAIModel()
  };
}

function buildTitleInput({ excerpt = "", fallbackTitle = "", imageDataUrl = "" } = {}) {
  const prompt = [
    `Fallback title: ${fallbackTitle || "Untitled pin"}`,
    imageDataUrl ? "Use the screenshot image to infer the title. If visible text is present, prefer the main subject or heading." : "Snippet excerpt:",
    excerpt || ""
  ]
    .filter(Boolean)
    .join("\n\n");

  if (!imageDataUrl) {
    return prompt;
  }

  return [
    {
      role: "user",
      content: [
        { type: "input_text", text: prompt },
        { type: "input_image", image_url: imageDataUrl, detail: "auto" }
      ]
    }
  ];
}

function providerErrorMessage(error) {
  const detail = String(error?.error?.message || error?.message || "").replace(/\s+/g, " ").trim();
  return detail ? `Smart title failed: ${detail.slice(0, 140)}` : "Smart title failed.";
}

module.exports = {
  buildTitleInput,
  generatePinTitle,
  openAIStatus
};
