import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { validChatRequest, hasNonImageAttachment } from "../src/chat/chat-validation.js";
import { detectMuseCLI, detectOpencodeCLI } from "../src/providers/detection.js";
import { model } from "../src/providers/muse/models.js";
import { projectOpenCodeModel, modelReference } from "../src/providers/opencode/models.js";

const input = {
  conversationId: "conversation",
  messageId: "message",
  providerId: "muse",
  modelId: "muse-spark-1.3",
  permissionMode: "promptUnmatched",
  reasoningEffort: "max",
  systemPrompt: "",
  messages: [{ role: "user", text: "Hello" }],
};

test("native chat validates Muse requests and rejects removed providers and invented modes", () => {
  assert.equal(validChatRequest(input, ["muse"]), true);
  assert.equal(
    validChatRequest({ ...input, providerId: "opencode" }, ["muse"]),
    false,
  );
  assert.equal(
    validChatRequest({ ...input, providerId: "opencode" }, [
      "muse",
      "opencode",
    ]),
    true,
  );
  for (const providerId of ["aider", "claude", "codex", "deepseek"]) {
    assert.equal(validChatRequest({ ...input, providerId }, ["muse"]), false);
  }
  for (const value of [
    null,
    {},
    { ...input, permissionMode: "auto" },
    { ...input, reasoningEffort: "turbo" },
    { ...input, modelId: "--flag" },
    { ...input, messages: [null] },
    { ...input, messages: [] },
    { ...input, conversationId: null },
  ]) {
    assert.equal(validChatRequest(value, ["muse"]), false);
  }
});

test("chat accepts image attachments and rejects other file kinds", () => {
  const image = {
    id: "attachment-1",
    name: "green.png",
    mimeType: "image/png",
    size: 100,
    kind: "image",
    dataUrl: "data:image/png;base64,Zm9v",
    text: "",
  };
  const withAttachments = (attachments: unknown[]) => ({
    ...input,
    messages: [{ role: "user", text: "Hello", attachments }],
  });

  assert.equal(validChatRequest(withAttachments([image]), ["muse"]), true);
  assert.equal(
    validChatRequest(withAttachments([{ ...image, kind: "text" }]), ["muse"]),
    false,
  );
  assert.equal(hasNonImageAttachment(withAttachments([image])), false);
  assert.equal(
    hasNonImageAttachment(withAttachments([{ ...image, kind: "pdf" }])),
    true,
  );
});

test("image input is advertised only for verified model families", () => {
  assert.deepEqual(model("muse-spark-1.3").inputModalities, ["text", "image"]);
  assert.deepEqual(model("unknown-model").inputModalities, ["text"]);
});

function fixtureCliScript(name: string, body: string): string {
  const folder = mkdtempSync(join(tmpdir(), "veykor-cli-detect-"));
  const path = join(folder, name);

  writeFileSync(path, `#!/bin/sh\n${body}\n`);
  chmodSync(path, 0o755);

  return path;
}

async function withEnvBin(
  name: string,
  value: string,
  run: () => Promise<void>,
): Promise<void> {
  const previous = process.env[name];
  process.env[name] = value;

  try {
    await run();
  } finally {
    if (previous === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = previous;
    }
  }
}

test("cli detection parses the Muse version", async () => {
  const script = fixtureCliScript(
    "muse",
    'echo "Muse Code 1.4.14 (1.4.14-R7309.1)"',
  );

  try {
    await withEnvBin("MUSE_BIN", script, async () => {
      assert.deepEqual(await detectMuseCLI(), {
        installed: true,
        version: "1.4.14",
      });
    });
  } finally {
    rmSync(dirname(script), { recursive: true, force: true });
  }
});

test("opencode detection parses the CLI version", async () => {
  const script = fixtureCliScript("opencode", 'echo "opencode v9.9.9-test"');

  try {
    await withEnvBin("OPENCODE_BIN", script, async () => {
      assert.deepEqual(await detectOpencodeCLI(), {
        installed: true,
        version: "9.9.9-test",
      });
    });
  } finally {
    rmSync(dirname(script), { recursive: true, force: true });
  }
});

test("opencode detection reports missing or failing CLIs as not installed", async () => {
  await withEnvBin(
    "OPENCODE_BIN",
    "veykor-definitely-missing-opencode-binary",
    async () => {
      assert.deepEqual(await detectOpencodeCLI(), {
        installed: false,
        version: "",
      });
    },
  );

  const script = fixtureCliScript("opencode", "exit 3");

  try {
    await withEnvBin("OPENCODE_BIN", script, async () => {
      assert.deepEqual(await detectOpencodeCLI(), {
        installed: false,
        version: "",
      });
    });
  } finally {
    rmSync(dirname(script), { recursive: true, force: true });
  }
});

test("OpenCode model mapping preserves nested IDs, prices and supported variants", () => {
  const entry = projectOpenCodeModel({
    id: "vendor/model",
    modelID: "vendor/model",
    providerID: "openrouter",
    name: "Example",
    enabled: true,
    variants: [{ id: "high" }, { id: "unrecognized" }],
    capabilities: { input: ["text", "image"] },
    limit: { context: 200000 },
    cost: [{ input: 2, output: 8, cache: { read: 0.5, write: 1 } }],
  });
  assert.equal(entry.id, "openrouter/vendor/model");
  assert.equal(entry.pricingAvailable, true);
  assert.equal(entry.inputPrice, 2);
  assert.equal(entry.cachedPrice, 0.5);
  assert.equal(entry.outputPrice, 8);
  assert.deepEqual(
    entry.reasoningEfforts.map((option) => option.tier),
    ["high"],
  );
  assert.deepEqual(modelReference(entry.id, "high"), {
    providerID: "openrouter",
    id: "vendor/model",
    variant: "high",
  });
  assert.throws(() => modelReference("invalid", "none"));
});
