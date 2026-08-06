const assert = require("node:assert/strict");
const { screenshotCaptureArgs } = require("../electron/screenshotCapture.cjs");

assert.deepEqual(screenshotCaptureArgs("/tmp/pin-it-capture.png"), [
  "-i",
  "-x",
  "/tmp/pin-it-capture.png"
]);

console.log("screenshot capture tests passed");
