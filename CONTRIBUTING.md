# Contributing to Pin It

Thanks for helping improve Pin It. The project is early, so small, focused
changes are easier to review and merge than broad rewrites.

## Before you start

- Search existing issues before opening a new one.
- Open an issue before starting a large feature or architectural change.
- Never include real API keys, personal pin data, local app-data folders, or
  signing credentials in an issue, fixture, screenshot, or commit.
- Keep product behavior changes separate from cleanup and generated artifacts.

## Development setup

You need Node.js 22 or newer and npm.

```sh
git clone https://github.com/johnnyzhoujz/pin-it-public.git
cd pin-it-public
npm ci
npm run desktop
```

Pin It's full capture workflow is currently macOS-first. Most model, renderer,
and MCP tests can still run without launching the desktop shell.

## Validate your change

Run the complete check before opening a pull request:

```sh
npm run check
```

If you changed packaged-app behavior, also create a local unpacked build:

```sh
npm run pack:mac
```

Local ad-hoc builds are not proof of Developer ID signing or notarization.

## Pull requests

Keep each pull request centered on one outcome. Include:

- What changed and why
- How you tested it
- Screenshots or recordings for visible UI changes
- Any macOS permission, data migration, MCP, or packaging implications

Do not commit `node_modules/`, build output, local `.vercel/` metadata, app data,
credential files, or generated release artifacts.

## Coding conventions

- Follow the existing two-space JavaScript, JSX, CSS, and JSON formatting.
- Prefer small functions and explicit names over new abstractions without a
  demonstrated need.
- Add or update regression tests when behavior changes.
- Preserve accessibility labels and keyboard behavior for interactive UI.
- Keep capture fast and local-first. Provider integrations must remain
  optional and transparent.

## Reporting security issues

Do not open a public issue for a vulnerability. Follow
[SECURITY.md](SECURITY.md) instead.
