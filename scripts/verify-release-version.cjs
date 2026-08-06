const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function expectedTag(packageVersion) {
  return `v${packageVersion}`;
}

function normalizeTag(value) {
  return String(value || "").trim().replace(/^refs\/tags\//, "");
}

function verifyReleaseVersion(packageVersion, tag) {
  const normalizedTag = normalizeTag(tag);
  assert.ok(normalizedTag, "A release tag is required.");
  assert.equal(
    normalizedTag,
    expectedTag(packageVersion),
    `Release tag ${normalizedTag} does not match package version ${packageVersion}.`
  );
  return normalizedTag;
}

if (require.main === module) {
  const projectDir = path.join(__dirname, "..");
  const packageJson = JSON.parse(fs.readFileSync(path.join(projectDir, "package.json"), "utf8"));
  const tag = process.argv[2] || process.env.GITHUB_REF_NAME || process.env.RELEASE_TAG;
  const verifiedTag = verifyReleaseVersion(packageJson.version, tag);
  console.log(`Release version verified: ${verifiedTag}`);
}

module.exports = {
  expectedTag,
  normalizeTag,
  verifyReleaseVersion
};
