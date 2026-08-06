# Pin It repository guidance

## Working practices

- Use `grep` for local text searches.
- Use the GitHub CLI (`gh`) for GitHub repository, issue, pull request, release,
  and workflow operations.
- Preserve unrelated and uncommitted user changes.
- Keep behavior changes, mechanical cleanup, generated assets, and release
  work in separate commits.
- Run `npm run check` before publishing a code change.

## Packaged-app testing

- The local manual-test bundle is `release/mac-arm64/Pin It.app`.
- Stop the visible app process before replacing a local package.
- Remove the old bundle before running `npm run pack:mac`; do not layer a new
  app bundle over an old one.
- Relaunch and verify the exact bundle path rather than relying on the app name,
  because duplicate `Pin It.app` bundles may exist.
- Claude-managed or other MCP helper processes can include the same app binary
  path in their command line. Do not treat those helpers as proof that the
  visible UI process is still running.

Local packages are ad-hoc signed unless a valid Developer ID identity is
available. A rebuild can change the code-signing requirement that macOS TCC
associates with Screen Recording permission. If region capture repeatedly asks
for permission after a rebuild, verify which app bundle is running and reset
only Pin It's Screen Recording grant:

```sh
tccutil reset ScreenCapture com.johnnyz.pinit
```

Do not change `build.appId` to work around a TCC problem. The durable release
fix is stable Developer ID signing and notarization.

Use this only as a local integrity check:

```sh
codesign --verify --deep --strict --verbose=2 "release/mac-arm64/Pin It.app"
```

It does not prove Developer ID signing or notarization.

Pin data lives under the user's Electron app-data directory, not inside the app
bundle, so replacing a packaged app should not remove saved pins or images.
