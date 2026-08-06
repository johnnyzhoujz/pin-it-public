const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

if (process.platform !== "darwin") {
  console.log("Skipping macOS Keychain helper build on this platform.");
  process.exit(0);
}

const projectRoot = path.resolve(__dirname, "..");
const sourcePath = path.join(projectRoot, "native", "keychain-helper.c");
const outputDirectory = path.join(projectRoot, "dist-native");
const outputPath = path.join(outputDirectory, "pinit-keychain-helper");

fs.mkdirSync(outputDirectory, { recursive: true });
execFileSync(
  "xcrun",
  [
    "--sdk",
    "macosx",
    "clang",
    "-arch",
    "arm64",
    "-arch",
    "x86_64",
    "-mmacosx-version-min=12.0",
    "-O2",
    "-Wall",
    "-Wextra",
    "-Werror",
    sourcePath,
    "-framework",
    "Security",
    "-framework",
    "CoreFoundation",
    "-o",
    outputPath
  ],
  { stdio: "inherit" }
);
fs.chmodSync(outputPath, 0o755);
console.log(`Built ${path.relative(projectRoot, outputPath)}`);
