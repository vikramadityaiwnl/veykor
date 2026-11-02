import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyChatDefaults, parseChatDefaults, validChatDefaults } from "../src/settings/chat-defaults.js";

test("chat defaults always parse to a complete state", () => {
  assert.deepEqual(emptyChatDefaults(), {
    defaultProviderId: "",
    models: {},
    efforts: {},
    messageBehavior: "queue",
    permissionMode: "promptUnmatched",
  });
  assert.deepEqual(parseChatDefaults("{}"), {
    defaultProviderId: "",
    models: {},
    efforts: {},
    messageBehavior: "queue",
    permissionMode: "promptUnmatched",
  });
  assert.deepEqual(
    parseChatDefaults(
      JSON.stringify({
        defaultProviderId: "muse",
        models: { muse: "muse-spark-1.3" },
        efforts: { "muse-spark-1.3": "max" },
        messageBehavior: "queue",
        permissionMode: "allowAll",
      }),
    ),
    {
      defaultProviderId: "muse",
      models: { muse: "muse-spark-1.3" },
      efforts: { "muse-spark-1.3": "max" },
      messageBehavior: "queue",
      permissionMode: "allowAll",
    },
  );
});

test("chat defaults drop unknown providers and malformed models", () => {
  for (const value of [
    null,
    42,
    [],
    "{not json",
    JSON.stringify({ defaultProviderId: "invented", models: {} }),
    JSON.stringify({ defaultProviderId: "muse" }),
  ]) {
    const parsed = parseChatDefaults(value);

    if (value === JSON.stringify({ defaultProviderId: "muse" })) {
      assert.deepEqual(parsed, {
        defaultProviderId: "muse",
        models: {},
        efforts: {},
        messageBehavior: "queue",
        permissionMode: "promptUnmatched",
      });
    } else {
      assert.deepEqual(parsed, {
        defaultProviderId: "",
        models: {},
        efforts: {},
        messageBehavior: "queue",
        permissionMode: "promptUnmatched",
      });
    }
  }

  assert.deepEqual(
    parseChatDefaults(
      JSON.stringify({
        defaultProviderId: "muse",
        models: {
          muse: "muse-spark-1.3",
          invented: "whatever",
          codex: "gpt-5",
          claude: "",
        },
        efforts: {
          "muse-spark-1.3": "max",
          "--flag": "max",
          "muse-wonder-1.0": "turbo",
        },
        messageBehavior: "queue",
        permissionMode: "auto",
      }),
    ),
    {
      defaultProviderId: "muse",
      models: { muse: "muse-spark-1.3" },
      efforts: { "muse-spark-1.3": "max" },
      messageBehavior: "queue",
      permissionMode: "promptUnmatched",
    },
  );
});

test("chat defaults reject invalid preference payloads", () => {
  assert.equal(
    validChatDefaults({
      defaultProviderId: "muse",
      models: { muse: "muse-spark-1.3" },
      efforts: { "muse-spark-1.3": "max" },
      messageBehavior: "queue",
      permissionMode: "allowAll",
    }),
    true,
  );
  assert.equal(validChatDefaults(emptyChatDefaults()), true);

  for (const value of [
    null,
    {},
    { defaultProviderId: "muse" },
    { defaultProviderId: "muse", models: {}, efforts: undefined },
    {
      defaultProviderId: "",
      models: {},
      efforts: {},
      messageBehavior: "queue",
      permissionMode: "auto",
    },
    {
      defaultProviderId: "invented",
      models: {},
      efforts: {},
      messageBehavior: "queue",
      permissionMode: "promptUnmatched",
    },
    {
      defaultProviderId: "claude",
      models: {},
      efforts: {},
      messageBehavior: "queue",
      permissionMode: "promptUnmatched",
    },
    {
      defaultProviderId: "",
      models: { invented: "whatever" },
      efforts: {},
      messageBehavior: "queue",
      permissionMode: "promptUnmatched",
    },
    {
      defaultProviderId: "",
      models: { muse: "" },
      efforts: {},
      messageBehavior: "queue",
      permissionMode: "promptUnmatched",
    },
    {
      defaultProviderId: "",
      models: { muse: "--flag" },
      efforts: {},
      messageBehavior: "queue",
      permissionMode: "promptUnmatched",
    },
    {
      defaultProviderId: "",
      models: [],
      efforts: {},
      messageBehavior: "queue",
      permissionMode: "promptUnmatched",
    },
    {
      defaultProviderId: "",
      models: {},
      efforts: { "muse-spark-1.3": "turbo" },
      messageBehavior: "queue",
      permissionMode: "promptUnmatched",
    },
    {
      defaultProviderId: "",
      models: {},
      efforts: { "--flag": "max" },
      messageBehavior: "queue",
      permissionMode: "promptUnmatched",
    },
  ]) {
    assert.equal(validChatDefaults(value), false);
  }
});

test("message behavior defaults to queue and accepts only queue or steer", () => {
  assert.equal(parseChatDefaults({}).messageBehavior, "queue");
  assert.equal(
    parseChatDefaults({ messageBehavior: "steer" }).messageBehavior,
    "steer",
  );
  assert.equal(
    parseChatDefaults({ messageBehavior: "invented" }).messageBehavior,
    "queue",
  );
  assert.equal(
    validChatDefaults({ ...emptyChatDefaults(), messageBehavior: "steer" }),
    true,
  );
  assert.equal(
    validChatDefaults({ ...emptyChatDefaults(), messageBehavior: "invented" }),
    false,
  );
});
