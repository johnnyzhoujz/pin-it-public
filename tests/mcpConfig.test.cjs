const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { configureMcpClients } = require("../electron/mcpConfig.cjs");

(async () => {
const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pinit-mcp-config-"));
const commandPath = path.join(tempRoot, "Pin It.app", "Contents", "MacOS", "Pin It");
const serverPath = path.join(
  tempRoot,
  "Pin It.app",
  "Contents",
  "Resources",
  "app.asar.unpacked",
  "dist-mcp",
  "pinit-mcp.mjs"
);
const storePath = path.join(tempRoot, "Library", "Application Support", "Keep That", "keeps.json");
await fs.mkdir(path.dirname(commandPath), { recursive: true });
await fs.mkdir(path.dirname(serverPath), { recursive: true });
await fs.writeFile(commandPath, "binary");
await fs.writeFile(serverPath, "server");

const homeDir = path.join(tempRoot, "home");
const codexPath = path.join(homeDir, ".codex", "config.toml");
const claudeCodePath = path.join(homeDir, ".claude.json");
const cursorPath = path.join(homeDir, ".cursor", "mcp.json");
const claudeDesktopPath = path.join(
  homeDir,
  "Library",
  "Application Support",
  "Claude",
  "claude_desktop_config.json"
);
await Promise.all([
  fs.mkdir(path.dirname(codexPath), { recursive: true }),
  fs.mkdir(path.dirname(cursorPath), { recursive: true }),
  fs.mkdir(path.dirname(claudeDesktopPath), { recursive: true })
]);

const oldCodexConfig = `[model_providers.local]
name = "Local"

[mcp_servers.other]
command = "other-server"

[mcp_servers."pin-it"]
command = "/old/Pin It"
args = ["/old/pinit-mcp.mjs"]
enabled = false

[mcp_servers."pin-it".env]
ELECTRON_RUN_AS_NODE = "1"
PINIT_STORE_PATH = "/old/keeps.json"
PINIT_TEST_SETTING = "preserve-me"

[mcp_servers."pin-it".tools.list_pins]
approval_mode = "approve"
`;
const oldClaudeCodeConfig = `${JSON.stringify(
  {
    projects: { "/example": { hasTrustDialogAccepted: true } },
    mcpServers: { "another-server": { type: "http", url: "https://example.com/mcp" } }
  },
  null,
  2
)}\n`;
const oldClaudeDesktopConfig = `${JSON.stringify(
  {
    globalShortcut: "Alt+W",
    mcpServers: {
      "pin-it": {
        command: "/old/Pin It",
        args: ["/old/pinit-mcp.mjs"],
        disabled: true,
        env: { PINIT_TEST_SETTING: "preserve-me" }
      }
    }
  },
  null,
  2
)}\n`;
await fs.writeFile(codexPath, oldCodexConfig, { mode: 0o600 });
await fs.writeFile(claudeCodePath, oldClaudeCodeConfig, { mode: 0o600 });
await fs.writeFile(claudeDesktopPath, oldClaudeDesktopConfig, { mode: 0o600 });

const fixedNow = () => new Date("2026-08-05T12:34:56.000Z");
const firstRun = await configureMcpClients({
  commandPath,
  homeDir,
  includeClaudeDesktop: true,
  now: fixedNow,
  serverPath,
  storePath
});
assert.deepEqual(firstRun.failed, []);
assert.deepEqual(firstRun.configured.sort(), ["claude-code", "claude-desktop", "codex", "cursor"]);
assert.equal(firstRun.results.find((result) => result.id === "cursor").action, "created");

const codexConfig = await fs.readFile(codexPath, "utf8");
assert.match(codexConfig, /\[model_providers\.local]/);
assert.match(codexConfig, /\[mcp_servers\.other]/);
assert.equal(codexConfig.includes(`command = ${JSON.stringify(commandPath)}`), true);
assert.equal(codexConfig.includes(`args = [${JSON.stringify(serverPath)}]`), true);
assert.equal(codexConfig.includes(`PINIT_STORE_PATH = ${JSON.stringify(storePath)}`), true);
assert.match(codexConfig, /enabled = false/);
assert.match(codexConfig, /PINIT_TEST_SETTING = "preserve-me"/);
assert.match(codexConfig, /\[mcp_servers\."pin-it"\.tools\.list_pins]/);
assert.match(codexConfig, /approval_mode = "approve"/);
assert.equal(codexConfig.includes("/old/Pin It"), false);

const claudeCodeConfig = JSON.parse(await fs.readFile(claudeCodePath, "utf8"));
assert.equal(claudeCodeConfig.projects["/example"].hasTrustDialogAccepted, true);
assert.equal(claudeCodeConfig.mcpServers["another-server"].url, "https://example.com/mcp");
assert.deepEqual(claudeCodeConfig.mcpServers["pin-it"], {
  type: "stdio",
  command: commandPath,
  args: [serverPath],
  env: { ELECTRON_RUN_AS_NODE: "1", PINIT_MCP_SERVER_NAME: "pin-it", PINIT_STORE_PATH: storePath }
});

const cursorConfig = JSON.parse(await fs.readFile(cursorPath, "utf8"));
assert.deepEqual(cursorConfig.mcpServers["pin-it"], {
  command: commandPath,
  args: [serverPath],
  env: { ELECTRON_RUN_AS_NODE: "1", PINIT_MCP_SERVER_NAME: "pin-it", PINIT_STORE_PATH: storePath }
});
const claudeDesktopConfig = JSON.parse(await fs.readFile(claudeDesktopPath, "utf8"));
assert.equal(claudeDesktopConfig.globalShortcut, "Alt+W");
assert.deepEqual(claudeDesktopConfig.mcpServers["pin-it"], {
  command: commandPath,
  args: [serverPath],
  disabled: true,
  env: {
    PINIT_TEST_SETTING: "preserve-me",
    ELECTRON_RUN_AS_NODE: "1",
    PINIT_MCP_SERVER_NAME: "pin-it",
    PINIT_STORE_PATH: storePath
  }
});

for (const result of firstRun.results.filter((item) => item.action === "updated")) {
  assert.ok(result.backupPath);
  await fs.access(result.backupPath);
}
assert.equal(await fs.readFile(firstRun.results.find((result) => result.id === "codex").backupPath, "utf8"), oldCodexConfig);
assert.equal((await fs.stat(codexPath)).mode & 0o777, 0o600);
assert.equal((await fs.stat(claudeCodePath)).mode & 0o777, 0o600);

const backupsBeforeSecondRun = (await recursiveFiles(homeDir)).filter((filePath) => filePath.includes(".pinit-backup-")).sort();
const secondRun = await configureMcpClients({
  commandPath,
  homeDir,
  includeClaudeDesktop: true,
  now: fixedNow,
  serverPath,
  storePath
});
assert.deepEqual(secondRun.failed, []);
assert.equal(secondRun.results.every((result) => result.action === "unchanged"), true);
const backupsAfterSecondRun = (await recursiveFiles(homeDir)).filter((filePath) => filePath.includes(".pinit-backup-")).sort();
assert.deepEqual(backupsAfterSecondRun, backupsBeforeSecondRun);

const defaultClaudeHome = path.join(tempRoot, "default-claude-home");
const defaultClaudeRun = await configureMcpClients({
  commandPath,
  homeDir: defaultClaudeHome,
  now: fixedNow,
  serverPath,
  storePath
});
assert.deepEqual(defaultClaudeRun.failed, []);
assert.deepEqual(defaultClaudeRun.configured.sort(), ["claude-code", "claude-desktop", "codex", "cursor"]);
const defaultClaudeDesktopConfig = JSON.parse(
  await fs.readFile(
    path.join(defaultClaudeHome, "Library", "Application Support", "Claude", "claude_desktop_config.json"),
    "utf8"
  )
);
assert.equal(defaultClaudeDesktopConfig.mcpServers["pin-it"].command, commandPath);

const devCommandPath = path.join(tempRoot, "Pin It Dev.app", "Contents", "MacOS", "Pin It Dev");
const devServerPath = path.join(
  tempRoot,
  "Pin It Dev.app",
  "Contents",
  "Resources",
  "app.asar.unpacked",
  "dist-mcp",
  "pinit-mcp.mjs"
);
const devStorePath = path.join(tempRoot, "Library", "Application Support", "Pin It Dev", "keeps.json");
await fs.mkdir(path.dirname(devCommandPath), { recursive: true });
await fs.mkdir(path.dirname(devServerPath), { recursive: true });
await fs.writeFile(devCommandPath, "dev binary");
await fs.writeFile(devServerPath, "dev server");
const devRun = await configureMcpClients({
  commandPath: devCommandPath,
  homeDir,
  includeClaudeDesktop: true,
  now: fixedNow,
  serverName: "pin-it-dev",
  serverPath: devServerPath,
  storePath: devStorePath
});
assert.deepEqual(devRun.failed, []);
const dualCodexConfig = await fs.readFile(codexPath, "utf8");
assert.match(dualCodexConfig, /\[mcp_servers\.pin-it]/);
assert.match(dualCodexConfig, /\[mcp_servers\.pin-it-dev]/);
assert.ok(dualCodexConfig.includes(`command = ${JSON.stringify(commandPath)}`));
assert.ok(dualCodexConfig.includes(`command = ${JSON.stringify(devCommandPath)}`));
for (const configPath of [claudeCodePath, cursorPath, claudeDesktopPath]) {
  const config = JSON.parse(await fs.readFile(configPath, "utf8"));
  assert.equal(config.mcpServers["pin-it"].command, commandPath);
  assert.equal(config.mcpServers["pin-it-dev"].command, devCommandPath);
  assert.equal(config.mcpServers["pin-it-dev"].env.PINIT_MCP_SERVER_NAME, "pin-it-dev");
  assert.equal(config.mcpServers["pin-it-dev"].env.PINIT_STORE_PATH, devStorePath);
}

const malformedHome = path.join(tempRoot, "malformed-home");
const malformedClaudePath = path.join(malformedHome, ".claude.json");
const malformedText = '{"mcpServers":';
await fs.mkdir(path.dirname(malformedClaudePath), { recursive: true });
await fs.writeFile(malformedClaudePath, malformedText);
const malformedRun = await configureMcpClients({
  commandPath,
  homeDir: malformedHome,
  includeClaudeDesktop: false,
  now: fixedNow,
  serverPath,
  storePath
});
assert.deepEqual(malformedRun.failed, ["claude-code"]);
assert.equal(malformedRun.results.find((result) => result.id === "claude-code").action, "failed");
assert.equal(await fs.readFile(malformedClaudePath, "utf8"), malformedText);
assert.equal((await recursiveFiles(malformedHome)).some((filePath) => filePath.includes(".pinit-backup-")), false);

const symlinkHome = path.join(tempRoot, "symlink-home");
const dotfilesDir = path.join(tempRoot, "dotfiles");
const linkedCursorConfig = path.join(dotfilesDir, "cursor-mcp.json");
const cursorLink = path.join(symlinkHome, ".cursor", "mcp.json");
await fs.mkdir(path.dirname(cursorLink), { recursive: true });
await fs.mkdir(dotfilesDir, { recursive: true });
await fs.writeFile(linkedCursorConfig, '{"mcpServers":{}}\n');
await fs.symlink(linkedCursorConfig, cursorLink);
const symlinkRun = await configureMcpClients({
  commandPath,
  homeDir: symlinkHome,
  includeClaudeDesktop: false,
  now: fixedNow,
  serverPath,
  storePath
});
assert.deepEqual(symlinkRun.failed, []);
assert.equal((await fs.lstat(cursorLink)).isSymbolicLink(), true);
assert.equal(JSON.parse(await fs.readFile(linkedCursorConfig, "utf8")).mcpServers["pin-it"].command, commandPath);

await assert.rejects(
  configureMcpClients({
    commandPath: path.join(tempRoot, "missing-app"),
    homeDir: path.join(tempRoot, "missing-app-home"),
    includeClaudeDesktop: false,
    serverPath,
    storePath
  }),
  /Pin It executable was not found/
);

console.log("MCP config tests passed");

async function recursiveFiles(directory) {
  const files = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await recursiveFiles(entryPath)));
    } else {
      files.push(entryPath);
    }
  }
  return files;
}
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
