const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

if (process.platform !== "darwin") {
  console.log("Skipping macOS Screen Recording permission add-on build on this platform.");
  process.exit(0);
}

const projectRoot = path.resolve(__dirname, "..");
const sourcePath = path.join(projectRoot, "native", "screen-permission.c");
const outputDirectory = path.join(projectRoot, "dist-native");
const outputPath = path.join(outputDirectory, "pinit-screen-permission.node");
const nodeIncludePath = findNodeIncludePath();

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
    "-bundle",
    "-undefined",
    "dynamic_lookup",
    `-I${nodeIncludePath}`,
    "-DNODE_GYP_MODULE_NAME=pinit_screen_permission",
    sourcePath,
    "-framework",
    "CoreGraphics",
    "-o",
    outputPath
  ],
  { stdio: "inherit" }
);
fs.chmodSync(outputPath, 0o755);

const addon = require(outputPath);
if (typeof addon.preflight !== "function" || typeof addon.request !== "function") {
  throw new Error("Screen Recording permission add-on is missing its expected exports.");
}
if (typeof addon.preflight() !== "boolean") {
  throw new Error("Screen Recording permission preflight did not return a boolean.");
}

console.log(`Built ${path.relative(projectRoot, outputPath)}`);

function findNodeIncludePath() {
  const candidates = [
    process.config.variables.node_prefix && path.join(process.config.variables.node_prefix, "include", "node"),
    path.resolve(path.dirname(process.execPath), "..", "include", "node")
  ].filter(Boolean);

  const includePath = candidates.find((candidate) => fs.existsSync(path.join(candidate, "node_api.h")));
  if (!includePath) {
    throw new Error("Could not locate node_api.h for the Screen Recording permission add-on build.");
  }
  return includePath;
}
