const { execFile } = require("node:child_process");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);
const rootDir = path.resolve(__dirname, "..");
const buildDir = path.join(rootDir, "build");
const sourcePath = path.join(buildDir, "icon.svg");
const previewPath = path.join(buildDir, "icon-preview.png");
const outputPath = path.join(buildDir, "icon.icns");
const alphaCheckPath = path.join(__dirname, "check-mac-icon-alpha.swift");

const iconFiles = [
  ["icon_16x16.png", 16],
  ["icon_16x16@2x.png", 32],
  ["icon_32x32.png", 32],
  ["icon_32x32@2x.png", 64],
  ["icon_128x128.png", 128],
  ["icon_128x128@2x.png", 256],
  ["icon_256x256.png", 256],
  ["icon_256x256@2x.png", 512],
  ["icon_512x512.png", 512],
  ["icon_512x512@2x.png", 1024]
];

(async () => {
  if (process.platform !== "darwin") {
    throw new Error("Mac icon generation requires macOS.");
  }

  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pinit-icon-"));
  const iconsetPath = path.join(tempRoot, "PinIt.iconset");
  try {
    await fs.mkdir(iconsetPath);
    await execFileAsync("sips", ["-s", "format", "png", sourcePath, "--out", previewPath]);

    for (const [fileName, size] of iconFiles) {
      await execFileAsync("sips", [
        "-z",
        String(size),
        String(size),
        previewPath,
        "--out",
        path.join(iconsetPath, fileName)
      ]);
    }

    await execFileAsync("swift", [
      alphaCheckPath,
      previewPath,
      path.join(iconsetPath, "icon_16x16.png"),
      path.join(iconsetPath, "icon_512x512@2x.png")
    ]);
    await execFileAsync("iconutil", ["-c", "icns", iconsetPath, "-o", outputPath]);

    console.log(`Built transparent macOS icon: ${outputPath}`);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error?.stderr || error?.message || error);
  process.exitCode = 1;
});
