import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const execFileAsync = promisify(execFile);
const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pinit-mcp-"));
const storePath = path.join(tempRoot, "keeps.json");
const imageId = "11111111-1111-4111-8111-111111111111";
const mcpCommand = process.env.PINIT_MCP_COMMAND || process.execPath;
const mcpServerPath = process.env.PINIT_MCP_SERVER || "dist-mcp/pinit-mcp.mjs";
const mcpEnv = { ...process.env, ELECTRON_RUN_AS_NODE: "1", PINIT_STORE_PATH: storePath };

await fs.mkdir(path.join(tempRoot, "images"), { recursive: true });
await fs.writeFile(path.join(tempRoot, "images", `${imageId}.png`), "image-bytes");
await fs.writeFile(
  storePath,
  `${JSON.stringify(
    {
      app: "Pin It",
      schemaVersion: 1,
      exportedAt: "2026-06-11T00:00:00.000Z",
      cutoverCompleted: "2026-06-11T00:00:00.000Z",
      data: {
        projectName: "Deck",
        snippets: [
          {
            id: "text-pin",
            title: "OAuth callback bug",
            content: "The redirect URI must match exactly.",
            contentType: "Text",
            projectName: "Deck",
            order: 0,
            createdAt: "2026-06-11T00:00:00.000Z",
            updatedAt: "2026-06-11T00:00:00.000Z"
          },
          {
            id: imageId,
            title: "Checkout error",
            content: `![Checkout error](pinit://pin/${imageId}/image)`,
            contentType: "Image",
            imagePath: `images/${imageId}.png`,
            projectName: "Deck",
            order: 1,
            createdAt: "2026-06-11T00:01:00.000Z",
            updatedAt: "2026-06-11T00:01:00.000Z"
          }
        ]
      }
    },
    null,
    2
  )}\n`
);

const selftest = await execFileAsync(mcpCommand, [mcpServerPath, "--selftest"], {
  env: mcpEnv
});
assert.equal(JSON.parse(selftest.stdout).pins, 2);

if (!process.env.PINIT_MCP_SERVER) {
  const linkedServerDirectory = path.join(tempRoot, "linked-mcp");
  await fs.symlink(path.resolve("dist-mcp"), linkedServerDirectory, "dir");
  const linkedSelftest = await execFileAsync(mcpCommand, [path.join(linkedServerDirectory, "pinit-mcp.mjs"), "--selftest"], {
    env: mcpEnv
  });
  assert.equal(JSON.parse(linkedSelftest.stdout).pins, 2);
}

const transport = new StdioClientTransport({
  command: mcpCommand,
  args: [mcpServerPath],
  env: mcpEnv,
  stderr: "pipe"
});
const client = new Client({ name: "pin-it-test", version: "0.0.0" });
await client.connect(transport);
assert.equal(client.getServerVersion()?.name, process.env.PINIT_EXPECTED_MCP_SERVER_NAME || "pin-it");

const tools = await client.listTools();
assert.deepEqual(
  tools.tools.map((tool) => tool.name).sort(),
  ["get_packet", "get_pin_image", "list_pins", "search_pins"]
);

const listResult = await client.callTool({ name: "list_pins", arguments: { project: "Deck" } });
assert.equal(listResult.structuredContent.pins.length, 2);
assert.equal(listResult.structuredContent.pins.find((pin) => pin.id === imageId).content, undefined);

const searchResult = await client.callTool({ name: "search_pins", arguments: { query: "redirect" } });
assert.equal(searchResult.structuredContent.pins[0].id, "text-pin");

const packetResult = await client.callTool({ name: "get_packet", arguments: { project: "Deck" } });
assert.match(packetResult.structuredContent.packet, /OAuth callback bug/);
assert.match(packetResult.structuredContent.packet, new RegExp(`pinit://pin/${imageId}/image`));
assert.doesNotMatch(packetResult.structuredContent.packet, /base64/);

const resources = await client.listResources();
assert.equal(resources.resources.some((resource) => resource.uri === `pinit://pin/${imageId}/image`), true);
const resource = await client.readResource({ uri: `pinit://pin/${imageId}/image` });
assert.equal(resource.contents[0].blob, Buffer.from("image-bytes").toString("base64"));

const imageResult = await client.callTool({ name: "get_pin_image", arguments: { pinId: imageId } });
assert.equal(imageResult.structuredContent.pinId, imageId);
assert.equal(imageResult.structuredContent.mimeType, "image/png");
assert.equal(imageResult.structuredContent.bytes, Buffer.byteLength("image-bytes"));
assert.equal(imageResult.structuredContent.base64, Buffer.from("image-bytes").toString("base64"));
assert.equal(imageResult.content.some((item) => item.type === "image"), true);

await client.close();
await fs.rm(tempRoot, { recursive: true, force: true });

console.log("mcp tests passed");
