const { execFileSync } = require("node:child_process");
const path = require("node:path");
const { signAsync } = require("@electron/osx-sign");

exports.default = async function adhocSignMac(context) {
  if (context.electronPlatformName !== "darwin") {
    return;
  }

  if (process.env.PIN_IT_ADHOC_SIGN === "0") {
    return;
  }

  if (process.env.CSC_LINK || process.env.CSC_NAME) {
    return;
  }

  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  const entitlementsPath = path.join(
    path.dirname(require.resolve("app-builder-lib/package.json")),
    "templates",
    "entitlements.mac.plist"
  );

  await signAsync({
    app: appPath,
    identity: "-",
    identityValidation: false,
    preAutoEntitlements: true,
    optionsForFile: () => ({
      entitlements: entitlementsPath,
      hardenedRuntime: true,
      timestamp: "none"
    })
  });

  execFileSync("codesign", ["--verify", "--deep", "--strict", "--all-architectures", appPath], {
    stdio: "inherit"
  });
};
