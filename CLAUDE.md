# Pin It contributor guidance

Read `README.md`, `CONTRIBUTING.md`, and `AGENTS.md` before changing the
project.

- Keep Pin It local-first and provider integrations optional.
- Preserve existing app data and the `xyz.justpinit.app` application ID.
- Add regression coverage for behavior changes.
- Run `npm run check` before proposing a code change.
- Treat local ad-hoc packaging as a development artifact, not a signed release.
