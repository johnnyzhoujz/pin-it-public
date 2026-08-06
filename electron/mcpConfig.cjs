const fs = require("node:fs/promises");
const path = require("node:path");
const { isDeepStrictEqual } = require("node:util");

const clientLabels = {
  codex: "Codex",
  "claude-code": "Claude Code",
  "claude-desktop": "Claude Desktop",
  cursor: "Cursor"
};

function pinItMcpConfig({ commandPath, serverName = "pin-it", serverPath, storePath, includeType = false }) {
  assertServerName(serverName);
  return {
    ...(includeType ? { type: "stdio" } : {}),
    command: commandPath,
    args: [serverPath],
    env: {
      ELECTRON_RUN_AS_NODE: "1",
      PINIT_MCP_SERVER_NAME: serverName,
      PINIT_STORE_PATH: storePath
    }
  };
}

function jsonConfigWithPinIt(text, serverConfig, serverName = "pin-it") {
  assertServerName(serverName);
  let config = {};
  if (String(text || "").trim()) {
    config = JSON.parse(text);
  }

  if (!isPlainObject(config)) {
    throw new Error("MCP configuration must contain a JSON object.");
  }
  if (config.mcpServers !== undefined && !isPlainObject(config.mcpServers)) {
    throw new Error('The "mcpServers" value must be a JSON object.');
  }
  const existingPinIt = isPlainObject(config.mcpServers?.[serverName]) ? config.mcpServers[serverName] : {};
  const nextPinIt = {
    ...existingPinIt,
    ...serverConfig,
    env: {
      ...(isPlainObject(existingPinIt.env) ? existingPinIt.env : {}),
      ...serverConfig.env
    }
  };
  if (isDeepStrictEqual(config.mcpServers?.[serverName], nextPinIt)) {
    return text;
  }

  return `${JSON.stringify(
    {
      ...config,
      mcpServers: {
        ...(config.mcpServers || {}),
        [serverName]: nextPinIt
      }
    },
    null,
    2
  )}\n`;
}

function codexConfigWithPinIt(text, serverConfig, serverName = "pin-it") {
  assertServerName(serverName);
  const targetTable = `mcp_servers.${serverName}`;
  const existingText = String(text || "");
  const newline = existingText.includes("\r\n") ? "\r\n" : "\n";
  const lines = existingText.replaceAll("\r\n", "\n").split("\n");
  const retained = [];
  const preservedChildSections = [];
  const preservedEnvSettings = [];
  const preservedParentSettings = [];
  let pinItSection = null;
  let preservedChildSection = null;

  for (const line of lines) {
    const tableName = tomlTableName(line);
    if (tableName !== null) {
      if (tableName === targetTable) {
        pinItSection = "parent";
        preservedChildSection = null;
        continue;
      }
      if (tableName === `${targetTable}.env`) {
        pinItSection = "env";
        preservedChildSection = null;
        continue;
      }
      if (tableName.startsWith(`${targetTable}.`)) {
        pinItSection = "child";
        preservedChildSection = [line];
        preservedChildSections.push(preservedChildSection);
        continue;
      }
      pinItSection = null;
      preservedChildSection = null;
    }

    if (pinItSection === "parent") {
      if (
        /^\s*(enabled|required|startup_timeout_sec|tool_timeout_sec|default_tools_approval_mode|enabled_tools|disabled_tools)\s*=/.test(
          line
        )
      ) {
        preservedParentSettings.push(line.trim());
      }
      continue;
    }
    if (pinItSection === "env") {
      if (!/^\s*(ELECTRON_RUN_AS_NODE|PINIT_MCP_SERVER_NAME|PINIT_STORE_PATH)\s*=/.test(line)) {
        preservedEnvSettings.push(line);
      }
      continue;
    }
    if (pinItSection === "child") {
      preservedChildSection.push(line);
      continue;
    }

    retained.push(line);
  }

  while (retained.length && !retained.at(-1).trim()) {
    retained.pop();
  }
  for (const section of preservedChildSections) {
    while (section.length && !section.at(-1).trim()) {
      section.pop();
    }
  }
  while (preservedEnvSettings.length && !preservedEnvSettings.at(-1).trim()) {
    preservedEnvSettings.pop();
  }

  const block = [
    `[mcp_servers.${serverName}]`,
    `command = ${tomlString(serverConfig.command)}`,
    `args = [${serverConfig.args.map(tomlString).join(", ")}]`,
    ...preservedParentSettings,
    "",
    `[mcp_servers.${serverName}.env]`,
    `ELECTRON_RUN_AS_NODE = ${tomlString(serverConfig.env.ELECTRON_RUN_AS_NODE)}`,
    `PINIT_MCP_SERVER_NAME = ${tomlString(serverConfig.env.PINIT_MCP_SERVER_NAME)}`,
    `PINIT_STORE_PATH = ${tomlString(serverConfig.env.PINIT_STORE_PATH)}`,
    ...preservedEnvSettings,
    ...preservedChildSections.flatMap((section) => ["", ...section])
  ];
  const nextText = [...retained, ...(retained.length ? [""] : []), ...block, ""].join(newline);

  return nextText === existingText ? existingText : nextText;
}

async function configureMcpClients({
  commandPath,
  homeDir,
  includeClaudeDesktop,
  now = () => new Date(),
  serverName = "pin-it",
  serverPath,
  storePath
}) {
  assertAbsolutePath("commandPath", commandPath);
  assertAbsolutePath("homeDir", homeDir);
  assertAbsolutePath("serverPath", serverPath);
  assertAbsolutePath("storePath", storePath);
  assertServerName(serverName);
  await Promise.all([
    assertExistingFile("Pin It executable", commandPath),
    assertExistingFile("bundled MCP server", serverPath)
  ]);

  const baseConfig = pinItMcpConfig({ commandPath, serverName, serverPath, storePath });
  const targets = [
    {
      id: "codex",
      filePath: path.join(homeDir, ".codex", "config.toml"),
      transform: (text) => codexConfigWithPinIt(text, baseConfig, serverName)
    },
    {
      id: "claude-code",
      filePath: path.join(homeDir, ".claude.json"),
      transform: (text) => jsonConfigWithPinIt(text, { type: "stdio", ...baseConfig }, serverName)
    },
    {
      id: "cursor",
      filePath: path.join(homeDir, ".cursor", "mcp.json"),
      transform: (text) => jsonConfigWithPinIt(text, baseConfig, serverName)
    }
  ];

  if (includeClaudeDesktop !== false) {
    targets.push({
      id: "claude-desktop",
      filePath: path.join(homeDir, "Library", "Application Support", "Claude", "claude_desktop_config.json"),
      transform: (text) => jsonConfigWithPinIt(text, baseConfig, serverName)
    });
  }

  const results = await Promise.all(
    targets.map(async (target) => {
      try {
        const write = await reconcileConfigFile({ filePath: target.filePath, now, transform: target.transform });
        return {
          id: target.id,
          label: clientLabels[target.id],
          filePath: target.filePath,
          ...write
        };
      } catch (error) {
        return {
          id: target.id,
          label: clientLabels[target.id],
          filePath: target.filePath,
          action: "failed",
          errorCode: error?.code || "config_write_failed",
          errorMessage: error?.message || String(error)
        };
      }
    })
  );

  return {
    configured: results.filter((result) => result.action !== "failed").map((result) => result.id),
    failed: results.filter((result) => result.action === "failed").map((result) => result.id),
    results
  };
}

async function reconcileConfigFile({ filePath, now, transform }) {
  const targetPath = await writableTarget(filePath);
  const existing = await readConfigFile(targetPath);
  const nextText = transform(existing.text);
  if (nextText === existing.text) {
    return { action: "unchanged" };
  }

  let backupPath = null;
  if (existing.exists) {
    backupPath = await backupConfigFile(targetPath, now());
  }
  await atomicWriteConfig(targetPath, nextText, existing.mode);
  return { action: existing.exists ? "updated" : "created", backupPath };
}

async function writableTarget(filePath) {
  try {
    const stats = await fs.lstat(filePath);
    if (stats.isSymbolicLink()) {
      return fs.realpath(filePath);
    }
    if (!stats.isFile()) {
      throw new Error(`MCP configuration path is not a file: ${filePath}`);
    }
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }
  return filePath;
}

async function readConfigFile(filePath) {
  try {
    const [text, stats] = await Promise.all([fs.readFile(filePath, "utf8"), fs.stat(filePath)]);
    return { exists: true, mode: stats.mode & 0o777, text };
  } catch (error) {
    if (error?.code === "ENOENT") {
      return { exists: false, mode: 0o600, text: "" };
    }
    throw error;
  }
}

async function backupConfigFile(filePath, date) {
  const stamp = date.toISOString().replaceAll(":", "-");
  let backupPath = `${filePath}.pinit-backup-${stamp}`;
  let suffix = 1;
  while (await pathExists(backupPath)) {
    backupPath = `${filePath}.pinit-backup-${stamp}-${suffix}`;
    suffix += 1;
  }
  await fs.copyFile(filePath, backupPath);
  return backupPath;
}

async function atomicWriteConfig(filePath, text, mode) {
  await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const tempPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`);
  try {
    await fs.writeFile(tempPath, text, { encoding: "utf8", flag: "wx", mode });
    await fs.rename(tempPath, filePath);
    await fs.chmod(filePath, mode);
  } catch (error) {
    await fs.rm(tempPath, { force: true }).catch(() => {});
    throw error;
  }
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function tomlTableName(line) {
  const match = String(line).match(/^\s*\[([^\[\]]+)]\s*(?:#.*)?$/);
  if (!match) {
    return null;
  }
  return match[1]
    .replaceAll(/\s+/g, "")
    .replaceAll(/"([A-Za-z0-9_-]+)"/g, "$1")
    .replaceAll(/'([A-Za-z0-9_-]+)'/g, "$1");
}

function tomlString(value) {
  return JSON.stringify(String(value));
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assertAbsolutePath(name, value) {
  if (!value || !path.isAbsolute(value)) {
    throw new Error(`${name} must be an absolute path.`);
  }
}

function assertServerName(value) {
  if (!/^[A-Za-z0-9_-]+$/.test(String(value || ""))) {
    throw new Error("serverName must contain only letters, numbers, hyphens, or underscores.");
  }
}

async function assertExistingFile(label, filePath) {
  try {
    const stats = await fs.stat(filePath);
    if (!stats.isFile()) {
      throw new Error(`${label} is not a file: ${filePath}`);
    }
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error(`${label} was not found: ${filePath}`);
    }
    throw error;
  }
}

module.exports = {
  codexConfigWithPinIt,
  configureMcpClients,
  jsonConfigWithPinIt,
  pinItMcpConfig
};
