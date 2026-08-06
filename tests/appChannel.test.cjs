const assert = require("node:assert/strict");
const devBuild = require("../electron-builder.dev.cjs");
const { channels, resolveAppChannel } = require("../electron/appChannel.cjs");

assert.equal(resolveAppChannel({ isPackaged: false, packagedName: "Electron" }), channels.development);
assert.equal(resolveAppChannel({ isPackaged: true, packagedName: "Pin It Dev" }), channels.development);
assert.equal(resolveAppChannel({ isPackaged: true, packagedName: "Pin It" }), channels.production);

assert.equal(channels.development.appId, "xyz.justpinit.app.dev");
assert.equal(channels.development.productName, "Pin It Dev");
assert.equal(channels.development.userDataDirectory, "Pin It Dev");
assert.equal(channels.development.keychainService, "Pin It Dev");
assert.equal(channels.development.mcpServerName, "pin-it-dev");
assert.equal(channels.development.clipboardHotkeyMac, "Command+Shift+I");
assert.equal(channels.development.screenshotHotkeyMac, "Command+Shift+O");
assert.equal(channels.development.clipboardHotkeyMac, channels.production.clipboardHotkeyMac);
assert.equal(channels.development.screenshotHotkeyMac, channels.production.screenshotHotkeyMac);

assert.equal(channels.production.appId, "xyz.justpinit.app");
assert.equal(channels.production.productName, "Pin It");
assert.equal(channels.production.userDataDirectory, "Keep That");
assert.equal(channels.production.keychainService, "Pin It");
assert.equal(channels.production.mcpServerName, "pin-it");
assert.doesNotMatch(channels.development.appId, /johnny/i);
assert.doesNotMatch(channels.production.appId, /johnny/i);

assert.equal(devBuild.appId, channels.development.appId);
assert.equal(devBuild.productName, channels.development.productName);
assert.equal(devBuild.directories.output, "release-dev");
assert.equal(devBuild.extraMetadata.productName, channels.development.productName);

console.log("app channel tests passed");
