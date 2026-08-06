const assert = require("node:assert/strict");
const {
  expectedTag,
  normalizeTag,
  verifyReleaseVersion
} = require("../scripts/verify-release-version.cjs");

assert.equal(expectedTag("0.2.6"), "v0.2.6");
assert.equal(normalizeTag("refs/tags/v0.2.6"), "v0.2.6");
assert.equal(verifyReleaseVersion("0.2.6", "v0.2.6"), "v0.2.6");
assert.throws(
  () => verifyReleaseVersion("0.2.6", "v0.2.5"),
  /does not match package version/
);
assert.throws(() => verifyReleaseVersion("0.2.6", ""), /release tag is required/i);

console.log("release version tests passed");
