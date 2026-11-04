import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test } from "node:test";
import type { ChatHistoryItem } from "@veykor/shared";
import MessageList from "../src/chat/components/message-list.tsx";

function userMessage(itemId: string): ChatHistoryItem {
  return {
    itemId,
    kind: "userMessage",
    status: "completed",
    turnId: "turn-1",
    text: "Continue after the teammate returns.",
    summary: [],
    tool: "",
    displayLabel: "",
    visibleOutput: "",
    args: "",
    recordedAt: "2026-11-04T00:00:00.000Z",
    attachments: [],
  };
}

test("duplicate user records render one thought block per turn", () => {
  const html = renderToStaticMarkup(
    createElement(MessageList, {
      chatId: "chat-1",
      generatedImages: [],
      imageUrls: [],
      hideThinkingByDefault: false,
      items: [userMessage("user-1"), userMessage("user-2")],
      livePreviews: {},
      questions: [],
      streaming: false,
      streamingTurnId: "",
      streamingStartedAt: 0,
      turnDurations: { "turn-1": 78000 },
    }),
  );

  assert.equal([...html.matchAll(/Thought for 78 seconds/g)].length, 1);
});

test("internal user messages keep the delegated turn's thought block", () => {
  const internalMessage = {
    ...userMessage("internal-1"),
    text: "",
  };
  const html = renderToStaticMarkup(
    createElement(MessageList, {
      chatId: "chat-1",
      generatedImages: [],
      imageUrls: [],
      hideThinkingByDefault: false,
      items: [internalMessage],
      livePreviews: {},
      questions: [],
      streaming: false,
      streamingTurnId: "",
      streamingStartedAt: 0,
      turnDurations: { "turn-1": 38000 },
    }),
  );

  assert.match(html, /Thought for 38 seconds/);
  assert.doesNotMatch(html, /Continue after the teammate returns/);
});
