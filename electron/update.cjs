const latestReleaseUrl = "https://api.github.com/repos/johnnyzhoujz/pin-it-public/releases/latest";

function compareVersions(left, right) {
  const leftParts = String(left || "0.0.0").replace(/^v/i, "").split(".").map((part) => Number.parseInt(part, 10) || 0);
  const rightParts = String(right || "0.0.0").replace(/^v/i, "").split(".").map((part) => Number.parseInt(part, 10) || 0);
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const delta = (leftParts[index] || 0) - (rightParts[index] || 0);
    if (delta) {
      return delta > 0 ? 1 : -1;
    }
  }

  return 0;
}

function hasDeveloperIdSignatureOutput(output = "") {
  const value = String(output);
  const hasDeveloperIdAuthority = /^Authority=Developer ID Application:/m.test(value);
  const teamIdentifier = value.match(/^TeamIdentifier=(.+)$/m)?.[1]?.trim();
  return Boolean(hasDeveloperIdAuthority && teamIdentifier && teamIdentifier !== "not set");
}

function isAutoUpdaterEligible({
  forceUnsigned = false,
  hasDeveloperIdSignature = false,
  hasUpdateConfig = false,
  isPackaged,
  platform,
  skipAutoUpdater = false
} = {}) {
  return Boolean(
    isPackaged &&
      platform === "darwin" &&
      hasUpdateConfig &&
      hasDeveloperIdSignature &&
      !forceUnsigned &&
      !skipAutoUpdater
  );
}

async function checkManualUpdate({ currentVersion, fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== "function") {
    return { available: false, reason: "fetch-unavailable" };
  }

  const response = await fetchImpl(latestReleaseUrl, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "Pin-It"
    }
  });

  if (!response.ok) {
    return { available: false, reason: "release-check-failed" };
  }

  const release = await response.json();
  const version = String(release.tag_name || release.name || "").replace(/^v/i, "");
  if (!version || compareVersions(version, currentVersion) <= 0) {
    return { available: false, version };
  }

  return {
    available: true,
    version,
    url: release.html_url || "https://github.com/johnnyzhoujz/pin-it-public/releases"
  };
}

module.exports = {
  checkManualUpdate,
  compareVersions,
  hasDeveloperIdSignatureOutput,
  isAutoUpdaterEligible,
  latestReleaseUrl
};
