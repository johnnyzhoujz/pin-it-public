const assert = require("node:assert/strict");
const { execFile } = require("node:child_process");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);
const channelDefinitions = {
  development: {
    appId: "xyz.justpinit.app.dev",
    productName: "Pin It Dev",
    mcpServerName: "pin-it-dev"
  },
  production: {
    appId: "xyz.justpinit.app",
    productName: "Pin It",
    mcpServerName: "pin-it"
  }
};

(async () => {
  const appPath = await fs.realpath(path.resolve(requiredArgument("--app")));
  const channelName = requiredArgument("--channel");
  const channel = channelDefinitions[channelName];
  if (!channel) {
    throw new Error('--channel must be "development" or "production".');
  }

  const appBinary = path.join(appPath, "Contents", "MacOS", channel.productName);
  const infoPlist = path.join(appPath, "Contents", "Info.plist");
  const serverPath = path.join(appPath, "Contents", "Resources", "app.asar.unpacked", "dist-mcp", "pinit-mcp.mjs");
  await Promise.all([assertFile(appBinary), assertFile(infoPlist), assertFile(serverPath)]);

  await execFileAsync("codesign", ["--verify", "--deep", "--strict", "--all-architectures", appPath]);
  const signature = await execFileAsync("codesign", ["-dv", "--verbose=4", appPath]);
  if (process.argv.includes("--require-developer-id")) {
    assert.match(`${signature.stdout}\n${signature.stderr}`, /Authority=Developer ID Application:/);
  }

  const bundleId = await execFileAsync("plutil", ["-extract", "CFBundleIdentifier", "raw", "-o", "-", infoPlist]);
  assert.equal(bundleId.stdout.trim(), channel.appId);

  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), `pinit-${channelName}-packaged-mcp-`));
  try {
    const configHome = path.join(tempRoot, "home");
    const storePath = path.join(tempRoot, "store", "keeps.json");
    await fs.mkdir(path.dirname(storePath), { recursive: true });

    const setup = await execFileAsync(appBinary, ["--mcp-setup-selftest"], {
      env: {
        ...process.env,
        PINIT_MCP_CONFIG_HOME: configHome,
        PINIT_STORE_PATH: storePath,
        PIN_IT_SKIP_AUTO_UPDATER: "1"
      },
      maxBuffer: 4 * 1024 * 1024
    });
    const setupResult = JSON.parse(setup.stdout.trim().split("\n").at(-1));
    assert.equal(setupResult.ok, true);
    assert.equal(setupResult.channel, channelName);
    assert.equal(setupResult.productName, channel.productName);
    assert.equal(setupResult.appId, channel.appId);
    assert.equal(setupResult.mcpServerName, channel.mcpServerName);
    assert.deepEqual(setupResult.setup.failed, []);
    for (const clientId of ["codex", "claude-code", "claude-desktop", "cursor"]) {
      assert.ok(setupResult.setup.configured.includes(clientId));
    }

    const codexConfig = await fs.readFile(path.join(configHome, ".codex", "config.toml"), "utf8");
    assert.match(codexConfig, new RegExp(`\\[mcp_servers\\.${channel.mcpServerName}\\]`));
    assert.ok(codexConfig.includes(`command = ${JSON.stringify(appBinary)}`));
    assert.ok(codexConfig.includes(`PINIT_MCP_SERVER_NAME = ${JSON.stringify(channel.mcpServerName)}`));
    assert.ok(codexConfig.includes(`PINIT_STORE_PATH = ${JSON.stringify(storePath)}`));

    const jsonConfigs = [
      path.join(configHome, ".claude.json"),
      path.join(configHome, ".cursor", "mcp.json"),
      path.join(configHome, "Library", "Application Support", "Claude", "claude_desktop_config.json")
    ];
    for (const configPath of jsonConfigs) {
      const config = JSON.parse(await fs.readFile(configPath, "utf8"));
      assert.deepEqual(config.mcpServers[channel.mcpServerName].args, [serverPath]);
      assert.equal(config.mcpServers[channel.mcpServerName].command, appBinary);
      assert.equal(config.mcpServers[channel.mcpServerName].env.PINIT_MCP_SERVER_NAME, channel.mcpServerName);
      assert.equal(config.mcpServers[channel.mcpServerName].env.PINIT_STORE_PATH, storePath);
    }

    const protocol = await execFileAsync(process.execPath, [path.join(__dirname, "..", "tests", "mcp.test.js")], {
      cwd: path.join(__dirname, ".."),
      env: {
        ...process.env,
        PINIT_EXPECTED_MCP_SERVER_NAME: channel.mcpServerName,
        PINIT_MCP_COMMAND: appBinary,
        PINIT_MCP_SERVER: serverPath,
        PINIT_MCP_SERVER_NAME: channel.mcpServerName
      },
      maxBuffer: 8 * 1024 * 1024
    });
    assert.match(protocol.stdout, /mcp tests passed/);

    console.log(
      JSON.stringify(
        {
          ok: true,
          channel: channelName,
          appPath,
          appId: channel.appId,
          mcpServerName: channel.mcpServerName,
          clients: setupResult.setup.configured
        },
        null,
        2
      )
    );
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

function requiredArgument(name) {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : "";
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing required argument: ${name}`);
  }
  return value;
}

async function assertFile(filePath) {
  const stats = await fs.stat(filePath);
  assert.equal(stats.isFile(), true, `Expected file: ${filePath}`);
}
