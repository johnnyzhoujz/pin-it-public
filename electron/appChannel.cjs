const channels = {
  development: {
    id: "development",
    appId: "xyz.justpinit.app.dev",
    productName: "Pin It Dev",
    userDataDirectory: "Pin It Dev",
    keychainService: "Pin It Dev",
    keychainLegacyServices: [],
    mcpServerName: "pin-it-dev",
    clipboardHotkeyMac: "Command+Shift+I",
    screenshotHotkeyMac: "Command+Shift+O"
  },
  production: {
    id: "production",
    appId: "xyz.justpinit.app",
    productName: "Pin It",
    userDataDirectory: "Keep That",
    keychainService: "Pin It",
    keychainLegacyServices: ["Keep That"],
    mcpServerName: "pin-it",
    clipboardHotkeyMac: "Command+Shift+I",
    screenshotHotkeyMac: "Command+Shift+O"
  }
};

function resolveAppChannel({ isPackaged, packagedName = "" } = {}) {
  if (!isPackaged || packagedName === channels.development.productName) {
    return channels.development;
  }
  return channels.production;
}

module.exports = {
  channels,
  resolveAppChannel
};
