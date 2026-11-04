import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test } from "node:test";
import type { ChatHistoryItem } from "@veykor/shared";
import ToolCallBlock from "../src/chat/components/tool-call-block.tsx";

function toolCallItem(): ChatHistoryItem {
  return {
    itemId: "tool-1",
    kind: "toolCall",
    status: "completed",
    turnId: "turn-1",
    text: "",
    summary: [],
    tool: "bash",
    displayLabel: "",
    visibleOutput:
      "Additional guidance: https://example.com/docs/setup\\n\\nFound 1 warning.",
    args: '{"command":"open https://example.com/docs/setup"}',
    recordedAt: "2026-11-04T00:00:00.000Z",
    attachments: [],
  };
}

test("tool output renders urls as plain text without links", () => {
  const html = renderToStaticMarkup(
    createElement(ToolCallBlock, { item: toolCallItem() }),
  );

  assert.match(html, /https:\/\/example\.com\/docs\/setup/);
  assert.doesNotMatch(html, /<a[\s>]/);
  assert.doesNotMatch(html, /href=/);
});
