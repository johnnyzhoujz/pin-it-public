const { build } = require("./package.json");

module.exports = {
  ...build,
  appId: "xyz.justpinit.app.dev",
  productName: "Pin It Dev",
  directories: {
    ...build.directories,
    output: "release-dev"
  },
  extraMetadata: {
    productName: "Pin It Dev"
  }
};
