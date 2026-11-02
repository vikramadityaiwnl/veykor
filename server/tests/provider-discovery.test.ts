import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, writeFileSync, chmodSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openCodeConnection, closeOpenCodeConnection } from "../src/providers/opencode/connection.js";

test("OpenCode v2 authenticates with its fixed username and reuses its host", async () => {
  const folder = mkdtempSync(join(tmpdir(), "veykor-opencode-"));
  const binary = join(folder, "opencode.mjs");
  const previous = process.env.OPENCODE_BIN;
  writeFileSync(
    binary,
    `#!/usr/bin/env node
import { createServer } from "node:http";
const port = Number(process.argv[process.argv.indexOf("--port") + 1]);
const expected = "Basic " + Buffer.from("opencode:" + process.env.OPENCODE_PASSWORD).toString("base64");
createServer((req, res) => {
  res.setHeader("Content-Type", "application/json");
  if (req.headers.authorization !== expected) {
    res.writeHead(401).end(JSON.stringify({ message: "Authentication required" }));
    return;
  }
  res.end(JSON.stringify(req.url === "/openapi.json"
    ? { paths: { "/api/session/{sessionID}/prompt": {} } }
    : { data: "authenticated" }));
}).listen(port, "127.0.0.1");
`,
  );
  chmodSync(binary, 0o755);
  process.env.OPENCODE_BIN = binary;

  try {
    const first = await openCodeConnection();
    assert.equal(await openCodeConnection(), first);
    assert.deepEqual(await first.request("GET", "/api/info"), {
      data: "authenticated",
    });
  } finally {
    await closeOpenCodeConnection();
    if (previous === undefined) {
      delete process.env.OPENCODE_BIN;
    } else {
      process.env.OPENCODE_BIN = previous;
    }
    rmSync(folder, { recursive: true, force: true });
  }
});

test(
  "OpenCode authentication failures fail promptly with the original error",
  { timeout: 5000 },
  async () => {
    const folder = mkdtempSync(join(tmpdir(), "veykor-opencode-reject-"));
    const binary = join(folder, "opencode.mjs");
    const previous = process.env.OPENCODE_BIN;
    writeFileSync(
      binary,
      `#!/usr/bin/env node
import { createServer } from "node:http";
const port = Number(process.argv[process.argv.indexOf("--port") + 1]);
createServer((req, res) => { res.writeHead(401).end("Authentication required"); }).listen(port, "127.0.0.1");
`,
    );
    chmodSync(binary, 0o755);
    process.env.OPENCODE_BIN = binary;

    try {
      await assert.rejects(openCodeConnection(), /401 Authentication required/);
    } finally {
      await closeOpenCodeConnection();
      if (previous === undefined) {
        delete process.env.OPENCODE_BIN;
      } else {
        process.env.OPENCODE_BIN = previous;
      }
      rmSync(folder, { recursive: true, force: true });
    }
  },
);
