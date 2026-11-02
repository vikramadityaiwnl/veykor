import { test } from "node:test";
import assert from "node:assert/strict";
import { toolCallPresentation } from "../src/workspace/tool-call-presentation";

test("shell details separate the command and stdout from protocol metadata", () => {
  const result = toolCallPresentation(
    JSON.stringify({
      command: "printf 'hello'",
      description: "Print a greeting",
      timeout: 1000,
    }),
    JSON.stringify({ output: "hello", chunk_id: "internal", exit_code: 0 }),
  );
  assert.equal(result.title, "Command");
  assert.equal(result.primary, "printf 'hello'");
  assert.equal(result.output, "hello");
  assert.equal(result.description, "Print a greeting");
  assert.equal(result.exitCode, "Exit code 0");
  assert.deepEqual(JSON.parse(result.extra), { timeout: 1000 });
});

test("tool details preserve structured results, MCP text, and unstructured values", () => {
  assert.equal(
    toolCallPresentation(
      "{}",
      JSON.stringify({
        content: [
          { type: "text", text: "First" },
          { type: "text", text: "Second" },
        ],
      }),
    ).output,
    "First\nSecond",
  );
  assert.equal(
    toolCallPresentation("raw command", "raw output").primary,
    "raw command",
  );
  assert.deepEqual(
    JSON.parse(toolCallPresentation("{}", '{"count":2}').output),
    { count: 2 },
  );
  assert.equal(
    toolCallPresentation('{"path":"/tmp/example"}', "").title,
    "File",
  );
});
