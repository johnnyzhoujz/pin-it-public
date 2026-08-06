import assert from "node:assert/strict";
import {
  LATEST_RELEASE_URL,
  applyReleaseDownloads,
  resolveReleaseDownloads,
  syncLatestReleaseDownloads
} from "../site/releaseDownloads.js";

assert.equal(
  LATEST_RELEASE_URL,
  "https://api.github.com/repos/johnnyzhoujz/pin-it-public/releases/latest"
);

const release = {
  tag_name: "v0.2.7",
  assets: [
    asset("Pin-It-0.2.7-arm64.dmg"),
    asset("Pin-It-0.2.7-x64.dmg"),
    asset("Pin-It-0.2.7-arm64.zip")
  ]
};

assert.deepEqual(resolveReleaseDownloads(release), {
  version: "0.2.7",
  downloads: {
    arm64:
      "https://github.com/johnnyzhoujz/pin-it-public/releases/download/v0.2.7/Pin-It-0.2.7-arm64.dmg",
    x64:
      "https://github.com/johnnyzhoujz/pin-it-public/releases/download/v0.2.7/Pin-It-0.2.7-x64.dmg"
  }
});
assert.equal(resolveReleaseDownloads({ ...release, assets: release.assets.slice(0, 1) }), null);
assert.equal(resolveReleaseDownloads({ ...release, tag_name: "draft" }), null);
assert.equal(
  resolveReleaseDownloads({
    ...release,
    assets: [
      {
        name: "Pin-It-0.2.7-arm64.dmg",
        browser_download_url: "https://example.com/Pin-It-0.2.7-arm64.dmg"
      },
      asset("Pin-It-0.2.7-x64.dmg")
    ]
  }),
  null
);

const documentRef = fakeDocument();
assert.equal(applyReleaseDownloads(documentRef, release), true);
assert.equal(documentRef.versionLabel.textContent, "0.2.7");
assert.deepEqual(
  documentRef.links.map((link) => ({
    architecture: link.dataset.downloadArchitecture,
    href: link.href,
    releaseVersion: link.dataset.releaseVersion,
    ariaLabel: link.attributes["aria-label"]
  })),
  [
    {
      architecture: "arm64",
      href: "https://github.com/johnnyzhoujz/pin-it-public/releases/download/v0.2.7/Pin-It-0.2.7-arm64.dmg",
      releaseVersion: "0.2.7",
      ariaLabel: "Download Pin It 0.2.7 for Apple silicon"
    },
    {
      architecture: "x64",
      href: "https://github.com/johnnyzhoujz/pin-it-public/releases/download/v0.2.7/Pin-It-0.2.7-x64.dmg",
      releaseVersion: "0.2.7",
      ariaLabel: "Download Pin It 0.2.7 for Intel Macs"
    }
  ]
);

const fetchedDocument = fakeDocument();
assert.equal(
  await syncLatestReleaseDownloads({
    documentRef: fetchedDocument,
    fetchImpl: async (url, options) => {
      assert.equal(url, LATEST_RELEASE_URL);
      assert.equal(options.headers.Accept, "application/vnd.github+json");
      return { ok: true, json: async () => release };
    }
  }),
  true
);
assert.equal(fetchedDocument.versionLabel.textContent, "0.2.7");
assert.equal(
  await syncLatestReleaseDownloads({
    documentRef: fakeDocument(),
    fetchImpl: async () => ({ ok: false })
  }),
  false
);

console.log("site release download tests passed");

function asset(name) {
  return {
    name,
    browser_download_url: `https://github.com/johnnyzhoujz/pin-it-public/releases/download/v0.2.7/${name}`
  };
}

function fakeDocument() {
  const links = [fakeLink("arm64"), fakeLink("x64")];
  const versionLabel = { textContent: "0.2.6" };
  return {
    links,
    versionLabel,
    querySelector(selector) {
      return selector === "[data-release-version]" ? versionLabel : null;
    },
    querySelectorAll(selector) {
      return selector === "[data-download-architecture]" ? links : [];
    }
  };
}

function fakeLink(architecture) {
  return {
    attributes: {},
    dataset: { downloadArchitecture: architecture },
    href: "",
    setAttribute(name, value) {
      this.attributes[name] = value;
    }
  };
}
