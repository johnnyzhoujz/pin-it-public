# Security Policy

## Supported versions

Pin It is an early project. Security fixes are applied to the latest code on
the default branch and, when applicable, the newest published release.

## Report a vulnerability

Please use
[GitHub's private vulnerability reporting form](https://github.com/johnnyzhoujz/pin-it-public/security/advisories/new).
Do not include vulnerability details, credentials, or personal pin data in a
public issue.

Useful reports include:

- A clear description of the impact
- Reproduction steps or a minimal proof of concept
- The affected commit or release
- Relevant macOS, Electron, MCP-client, or Node.js versions
- Suggested mitigations, if known

Please allow time to investigate before disclosing the issue publicly.

## Sensitive areas

Reports involving these areas are especially useful:

- Access to local pins or images outside the intended app-data directory
- Exposure of API keys stored through the credential bridge
- Unsafe renderer-to-main IPC behavior
- MCP tools returning data outside the configured Pin It store
- Update or installer integrity problems
- Unexpected network transmission of pin content
