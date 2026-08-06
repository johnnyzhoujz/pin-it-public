export const LATEST_RELEASE_URL =
  "https://api.github.com/repos/johnnyzhoujz/pin-it-public/releases/latest";

const DOWNLOAD_LABELS = {
  arm64: "Apple silicon",
  x64: "Intel Macs"
};

export function resolveReleaseDownloads(release) {
  const versionMatch = /^v(\d+\.\d+\.\d+)$/.exec(String(release?.tag_name || ""));
  if (!versionMatch || !Array.isArray(release?.assets)) {
    return null;
  }

  const version = versionMatch[1];
  const downloads = {};
  for (const architecture of Object.keys(DOWNLOAD_LABELS)) {
    const expectedName = `Pin-It-${version}-${architecture}.dmg`;
    const asset = release.assets.find((candidate) => candidate?.name === expectedName);
    if (!asset || !isTrustedDownloadUrl(asset.browser_download_url, release.tag_name, expectedName)) {
      return null;
    }
    downloads[architecture] = asset.browser_download_url;
  }

  return { downloads, version };
}

export function applyReleaseDownloads(documentRef, release) {
  const resolved = resolveReleaseDownloads(release);
  if (!resolved) {
    return false;
  }

  const links = Array.from(documentRef.querySelectorAll("[data-download-architecture]"));
  if (
    links.length !== Object.keys(DOWNLOAD_LABELS).length ||
    links.some((link) => !resolved.downloads[link.dataset.downloadArchitecture])
  ) {
    return false;
  }

  const versionLabel = documentRef.querySelector("[data-release-version]");
  if (!versionLabel) {
    return false;
  }

  versionLabel.textContent = resolved.version;
  links.forEach((link) => {
    const architecture = link.dataset.downloadArchitecture;
    link.href = resolved.downloads[architecture];
    link.dataset.releaseVersion = resolved.version;
    link.setAttribute(
      "aria-label",
      `Download Pin It ${resolved.version} for ${DOWNLOAD_LABELS[architecture]}`
    );
  });
  return true;
}

export async function syncLatestReleaseDownloads({
  documentRef = document,
  fetchImpl = globalThis.fetch
} = {}) {
  if (typeof fetchImpl !== "function") {
    return false;
  }

  try {
    const response = await fetchImpl(LATEST_RELEASE_URL, {
      headers: { Accept: "application/vnd.github+json" }
    });
    if (!response.ok) {
      return false;
    }
    return applyReleaseDownloads(documentRef, await response.json());
  } catch {
    return false;
  }
}

function isTrustedDownloadUrl(value, tagName, filename) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname === "github.com" &&
      url.pathname ===
        `/johnnyzhoujz/pin-it-public/releases/download/${encodeURIComponent(tagName)}/${encodeURIComponent(filename)}`
    );
  } catch {
    return false;
  }
}
