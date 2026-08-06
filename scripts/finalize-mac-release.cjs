const crypto = require("node:crypto");
const fsSync = require("node:fs");
const fs = require("node:fs/promises");
const path = require("node:path");
const { buildBlockMap } = require("app-builder-lib/out/targets/blockmap/blockmap");

const ARCHITECTURES = ["x64", "arm64"];
const EXTENSIONS = ["zip", "dmg"];

async function finalizeMacRelease({
  projectDir = path.join(__dirname, ".."),
  releaseDate = new Date().toISOString()
} = {}) {
  const packageJson = JSON.parse(await fs.readFile(path.join(projectDir, "package.json"), "utf8"));
  const releaseDir = path.join(projectDir, "release");
  const artifacts = [];

  for (const extension of EXTENSIONS) {
    for (const architecture of ARCHITECTURES) {
      const filename = renderArtifactName(packageJson, architecture, extension);
      const filePath = path.join(releaseDir, filename);
      await assertFile(filePath);
      await buildBlockMap(filePath, "gzip", `${filePath}.blockmap`);
      artifacts.push(await describeArtifact(filePath, architecture, extension));
    }
  }

  const manifest = serializeManifest({
    version: packageJson.version,
    artifacts,
    releaseDate
  });
  const manifestPath = path.join(releaseDir, "latest-mac.yml");
  await fs.writeFile(manifestPath, manifest, "utf8");
  const checksumPath = path.join(releaseDir, "SHA256SUMS.txt");
  await fs.writeFile(checksumPath, serializeChecksums(artifacts), "utf8");
  return { manifestPath, checksumPath, artifacts };
}

function renderArtifactName(packageJson, architecture, extension) {
  const template = packageJson.build?.artifactName;
  if (!template) {
    throw new Error("build.artifactName is required for release finalization.");
  }
  const filename = template
    .replaceAll("${name}", packageJson.name)
    .replaceAll("${productName}", packageJson.productName)
    .replaceAll("${version}", packageJson.version)
    .replaceAll("${arch}", architecture)
    .replaceAll("${ext}", extension);
  if (filename.includes("${")) {
    throw new Error(`Unsupported artifactName template: ${template}`);
  }
  return filename;
}

async function assertFile(filePath) {
  const stats = await fs.stat(filePath);
  if (!stats.isFile()) {
    throw new Error(`Expected release artifact: ${filePath}`);
  }
}

async function describeArtifact(filePath, architecture, extension) {
  const [stats, sha256, sha512] = await Promise.all([
    fs.stat(filePath),
    hashFile(filePath, "sha256", "hex"),
    hashFile(filePath, "sha512")
  ]);
  return {
    architecture,
    extension,
    filename: path.basename(filePath),
    url: path.basename(filePath).replaceAll(" ", "-"),
    sha256,
    sha512,
    size: stats.size
  };
}

async function hashFile(filePath, algorithm, encoding = "base64") {
  const hash = crypto.createHash(algorithm);
  const stream = fsSync.createReadStream(filePath);
  for await (const chunk of stream) {
    hash.update(chunk);
  }
  return hash.digest(encoding);
}

function serializeChecksums(artifacts) {
  return `${artifacts.map(({ sha256, filename }) => `${sha256}  ${filename}`).join("\n")}\n`;
}

function serializeManifest({ version, artifacts, releaseDate }) {
  const expectedKeys = EXTENSIONS.flatMap((extension) =>
    ARCHITECTURES.map((architecture) => `${architecture}:${extension}`)
  );
  const byKey = new Map(
    artifacts.map((artifact) => [`${artifact.architecture}:${artifact.extension}`, artifact])
  );
  for (const key of expectedKeys) {
    if (!byKey.has(key)) {
      throw new Error(`Missing macOS release artifact metadata: ${key}`);
    }
  }

  const ordered = expectedKeys.map((key) => byKey.get(key));
  const legacy = byKey.get("x64:zip");
  const lines = [`version: ${version}`, "files:"];
  for (const artifact of ordered) {
    lines.push(
      `  - url: ${artifact.url}`,
      `    sha512: ${artifact.sha512}`,
      `    size: ${artifact.size}`
    );
  }
  lines.push(
    `path: ${legacy.url}`,
    `sha512: ${legacy.sha512}`,
    `releaseDate: '${releaseDate}'`,
    ""
  );
  return lines.join("\n");
}

if (require.main === module) {
  finalizeMacRelease()
    .then(({ manifestPath, checksumPath, artifacts }) => {
      console.log(
        JSON.stringify(
          {
            ok: true,
            manifestPath,
            checksumPath,
            artifacts: artifacts.map(({ architecture, extension, filename, size }) => ({
              architecture,
              extension,
              filename,
              size
            }))
          },
          null,
          2
        )
      );
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}

module.exports = {
  ARCHITECTURES,
  EXTENSIONS,
  finalizeMacRelease,
  renderArtifactName,
  serializeChecksums,
  serializeManifest
};
