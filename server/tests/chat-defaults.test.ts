import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyChatDefaults, parseChatDefaults, validChatDefaults } from "../src/settings/chat-defaults.js";

test("chat defaults always parse to a complete state", () => {
  assert.deepEqual(emptyChatDefaults(), {
    defaultProviderId: "",
    models: {},
    efforts: {},
    permissionMode: "promptUnmatched",
  });
  assert.deepEqual(parseChatDefaults("{}"), {
    defaultProviderId: "",
    models: {},
    efforts: {},
    permissionMode: "promptUnmatched",
  });
  assert.deepEqual(
    parseChatDefaults(
      JSON.stringify({
        defaultProviderId: "muse",
        models: { muse: "muse-spark-1.3" },
        efforts: { "muse-spark-1.3": "max" },
        permissionMode: "allowAll",
      }),
    ),
    {
      defaultProviderId: "muse",
      models: { muse: "muse-spark-1.3" },
      efforts: { "muse-spark-1.3": "max" },
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
        permissionMode: "promptUnmatched",
      });
    } else {
      assert.deepEqual(parsed, {
        defaultProviderId: "",
        models: {},
        efforts: {},
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
          codex: "--flag",
          claude: "",
        },
        efforts: {
          "muse-spark-1.3": "max",
          "--flag": "max",
          "muse-wonder-1.0": "turbo",
        },
        permissionMode: "auto",
      }),
    ),
    {
      defaultProviderId: "muse",
      models: { muse: "muse-spark-1.3" },
      efforts: { "muse-spark-1.3": "max" },
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
      permissionMode: "auto",
    },
    {
      defaultProviderId: "invented",
      models: {},
      efforts: {},
      permissionMode: "promptUnmatched",
    },
    {
      defaultProviderId: "",
      models: { invented: "whatever" },
      efforts: {},
      permissionMode: "promptUnmatched",
    },
    {
      defaultProviderId: "",
      models: { muse: "" },
      efforts: {},
      permissionMode: "promptUnmatched",
    },
    {
      defaultProviderId: "",
      models: { muse: "--flag" },
      efforts: {},
      permissionMode: "promptUnmatched",
    },
    {
      defaultProviderId: "",
      models: [],
      efforts: {},
      permissionMode: "promptUnmatched",
    },
    {
      defaultProviderId: "",
      models: {},
      efforts: { "muse-spark-1.3": "turbo" },
      permissionMode: "promptUnmatched",
    },
    {
      defaultProviderId: "",
      models: {},
      efforts: { "--flag": "max" },
      permissionMode: "promptUnmatched",
    },
  ]) {
    assert.equal(validChatDefaults(value), false);
  }
});
