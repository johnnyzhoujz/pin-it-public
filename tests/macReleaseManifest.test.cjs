const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  renderArtifactName,
  serializeChecksums,
  serializeManifest
} = require("../scripts/finalize-mac-release.cjs");

const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"));
for (const target of packageJson.build.mac.target) {
  assert.deepEqual(target.arch, ["arm64", "x64"]);
}
assert.match(packageJson.scripts["dist:mac:prod"], /--arm64 --x64$/);
assert.match(packageJson.scripts.release, /--arm64 --x64 --publish always$/);
assert.equal(renderArtifactName(packageJson, "arm64", "dmg"), "Pin-It-0.2.5-arm64.dmg");

const artifacts = [
  artifact("x64", "zip"),
  artifact("arm64", "zip"),
  artifact("x64", "dmg"),
  artifact("arm64", "dmg")
];
const manifest = serializeManifest({
  version: "1.2.3",
  artifacts,
  releaseDate: "2026-08-06T00:00:00.000Z"
});

for (const architecture of ["x64", "arm64"]) {
  for (const extension of ["zip", "dmg"]) {
    assert.match(manifest, new RegExp(`Pin-It-1\\.2\\.3-${architecture}\\.${extension}`));
  }
}
assert.match(manifest, /path: Pin-It-1\.2\.3-x64\.zip/);
assert.match(manifest, /releaseDate: '2026-08-06T00:00:00\.000Z'/);
const checksums = serializeChecksums(artifacts);
for (const architecture of ["x64", "arm64"]) {
  for (const extension of ["zip", "dmg"]) {
    assert.match(checksums, new RegExp(`${architecture}-${extension}-sha256  Pin-It-1\\.2\\.3-${architecture}\\.${extension}`));
  }
}
assert.throws(
  () => serializeManifest({ version: "1.2.3", artifacts: artifacts.slice(1), releaseDate: "now" }),
  /Missing macOS release artifact metadata: x64:zip/
);

console.log("mac release manifest tests passed");

function artifact(architecture, extension) {
  return {
    architecture,
    extension,
    filename: `Pin-It-1.2.3-${architecture}.${extension}`,
    url: `Pin-It-1.2.3-${architecture}.${extension}`,
    sha256: `${architecture}-${extension}-sha256`,
    sha512: `${architecture}-${extension}-hash`,
    size: 123
  };
}
