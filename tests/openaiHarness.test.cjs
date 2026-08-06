const assert = require("node:assert/strict");
const Module = require("node:module");

function testOpenAIStatusPreservesKeychainAccessFailure() {
  const { openAIStatus } = require("../electron/openaiHarness.cjs");
  const unavailable = openAIStatus({ configured: false, errorCode: "keychain_unavailable" });
  const configured = openAIStatus({ configured: true, source: "macOS Keychain", errorCode: "keychain_unavailable" });

  assert.equal(unavailable.configured, false);
  assert.equal(unavailable.errorCode, "keychain_unavailable");
  assert.equal(configured.configured, true);
  assert.equal(configured.errorCode, "");
}

async function testGeneratePinTitleCallsResponsesCreate() {
  const originalLoad = Module._load;
  let capturedPayload = null;
  let callCount = 0;

  Module._load = function load(request, parent, isMain) {
    if (request === "openai") {
      return class FakeOpenAI {
        constructor(options) {
          assert.equal(options.apiKey, "test-key");
        }

        responses = {
          create: async (payload) => {
            callCount += 1;
            capturedPayload = payload;
            return { output_text: "Generated activation title" };
          }
        };
      };
    }

    return originalLoad.call(this, request, parent, isMain);
  };

  delete require.cache[require.resolve("../electron/openaiHarness.cjs")];
  const { generatePinTitle } = require("../electron/openaiHarness.cjs");

  try {
    const result = await generatePinTitle(
      {
        content: "A saved excerpt about activation metrics and weekly retained users.",
        contentType: "Text",
        fallbackTitle: "A saved excerpt about activation metrics"
      },
      { apiKey: "test-key" }
    );

    assert.equal(callCount, 1);
    assert.equal(result.ok, true);
    assert.equal(result.text, "Generated activation title");
    assert.equal(capturedPayload.model, "gpt-5.6-luna");
    assert.equal(capturedPayload.store, false);
    assert.equal(capturedPayload.reasoning.effort, "low");
    assert.equal(capturedPayload.text.verbosity, "low");
    assert.match(capturedPayload.input, /activation metrics/);
  } finally {
    Module._load = originalLoad;
    delete require.cache[require.resolve("../electron/openaiHarness.cjs")];
  }
}

async function testGeneratePinTitleSendsImageInput() {
  const originalLoad = Module._load;
  let capturedPayload = null;

  Module._load = function load(request, parent, isMain) {
    if (request === "openai") {
      return class FakeOpenAI {
        responses = {
          create: async (payload) => {
            capturedPayload = payload;
            return { output_text: "Checkout Error Screenshot" };
          }
        };
      };
    }

    return originalLoad.call(this, request, parent, isMain);
  };

  delete require.cache[require.resolve("../electron/openaiHarness.cjs")];
  const { generatePinTitle } = require("../electron/openaiHarness.cjs");

  try {
    const imageDataUrl = "data:image/png;base64,aW1hZ2U=";
    const result = await generatePinTitle(
      {
        content: "Screenshot",
        contentType: "Image",
        fallbackTitle: "Screenshot",
        imageDataUrl
      },
      { apiKey: "test-key" }
    );

    assert.equal(result.ok, true);
    assert.equal(result.text, "Checkout Error Screenshot");
    assert.equal(capturedPayload.store, false);
    assert.equal(capturedPayload.reasoning.effort, "low");
    assert.equal(capturedPayload.input[0].role, "user");
    assert.deepEqual(capturedPayload.input[0].content[1], {
      type: "input_image",
      image_url: imageDataUrl,
      detail: "auto"
    });
  } finally {
    Module._load = originalLoad;
    delete require.cache[require.resolve("../electron/openaiHarness.cjs")];
  }
}

async function testGeneratePinTitleReportsProviderError() {
  const originalLoad = Module._load;

  Module._load = function load(request, parent, isMain) {
    if (request === "openai") {
      return class FakeOpenAI {
        responses = {
          create: async () => {
            const error = new Error("quota exhausted");
            error.code = "insufficient_quota";
            throw error;
          }
        };
      };
    }

    return originalLoad.call(this, request, parent, isMain);
  };

  delete require.cache[require.resolve("../electron/openaiHarness.cjs")];
  const { generatePinTitle } = require("../electron/openaiHarness.cjs");

  try {
    const result = await generatePinTitle({ content: "A real excerpt", contentType: "Text" }, { apiKey: "test-key" });

    assert.equal(result.ok, false);
    assert.equal(result.code, "insufficient_quota");
    assert.match(result.message, /quota exhausted/);
  } finally {
    Module._load = originalLoad;
    delete require.cache[require.resolve("../electron/openaiHarness.cjs")];
  }
}

async function testGeneratePinTitleSkipsWithoutKey() {
  const { generatePinTitle } = require("../electron/openaiHarness.cjs");
  const result = await generatePinTitle({ content: "Skipped excerpt", contentType: "Text" }, { apiKey: "" });

  assert.equal(result.ok, false);
  assert.equal(result.code, "not_configured");
}

(async () => {
  testOpenAIStatusPreservesKeychainAccessFailure();
  await testGeneratePinTitleCallsResponsesCreate();
  await testGeneratePinTitleSendsImageInput();
  await testGeneratePinTitleReportsProviderError();
  await testGeneratePinTitleSkipsWithoutKey();
  console.log("openai harness tests passed");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
