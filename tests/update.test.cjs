const assert = require("node:assert/strict");
const {
  checkManualUpdate,
  compareVersions,
  hasDeveloperIdSignatureOutput,
  isAutoUpdaterEligible,
  latestReleaseUrl
} = require("../electron/update.cjs");

assert.equal(latestReleaseUrl, "https://api.github.com/repos/johnnyzhoujz/pin-it-public/releases/latest");

assert.equal(compareVersions("0.2.0", "0.1.1"), 1);
assert.equal(compareVersions("v0.2.0", "0.2.0"), 0);
assert.equal(compareVersions("0.1.1", "0.2.0"), -1);

const developerIdOutput = `Authority=Developer ID Application: Johnny Z (ABCDE12345)
TeamIdentifier=ABCDE12345`;
const adHocOutput = `Signature=adhoc
TeamIdentifier=not set`;
assert.equal(hasDeveloperIdSignatureOutput(developerIdOutput), true);
assert.equal(hasDeveloperIdSignatureOutput(adHocOutput), false);
assert.equal(hasDeveloperIdSignatureOutput("TeamIdentifier=ABCDE12345"), false);

assert.equal(
  isAutoUpdaterEligible({
    isPackaged: true,
    platform: "darwin",
    hasUpdateConfig: true,
    hasDeveloperIdSignature: true
  }),
  true
);
assert.equal(isAutoUpdaterEligible({ isPackaged: true, platform: "darwin", hasUpdateConfig: true }), false);
assert.equal(isAutoUpdaterEligible({ isPackaged: true, platform: "darwin" }), false);
assert.equal(
  isAutoUpdaterEligible({
    isPackaged: true,
    platform: "darwin",
    forceUnsigned: true,
    hasUpdateConfig: true,
    hasDeveloperIdSignature: true
  }),
  false
);
assert.equal(isAutoUpdaterEligible({ isPackaged: false, platform: "darwin" }), false);
assert.equal(isAutoUpdaterEligible({ isPackaged: true, platform: "linux" }), false);

(async () => {
  const newer = await checkManualUpdate({
    currentVersion: "0.1.1",
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ tag_name: "v0.2.0", html_url: "https://github.com/johnnyzhoujz/pin-it-public/releases/tag/v0.2.0" })
    })
  });
  assert.deepEqual(newer, {
    available: true,
    version: "0.2.0",
    url: "https://github.com/johnnyzhoujz/pin-it-public/releases/tag/v0.2.0"
  });

  const current = await checkManualUpdate({
    currentVersion: "0.2.0",
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ tag_name: "v0.2.0" })
    })
  });
  assert.equal(current.available, false);

  const failed = await checkManualUpdate({
    currentVersion: "0.2.0",
    fetchImpl: async () => ({ ok: false })
  });
  assert.equal(failed.available, false);

  console.log("update tests passed");
})();
