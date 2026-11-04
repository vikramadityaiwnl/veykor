import assert from "node:assert/strict";
import { test } from "node:test";
import type { ChatSummary } from "@veykor/shared";
import {
  clearableProjectChats,
  projectChats,
} from "../src/chat/project-chats.ts";

function chat(
  id: string,
  projectId: string,
  options: { running?: boolean } = {},
): ChatSummary {
  return {
    id,
    title: id,
    sectionId: "recent",
    projectId,
    agentId: "",
    agentName: "",
    museSessionId: "",
    running: options.running ?? false,
    pullRequests: [],
    createdAt: "",
    updatedAt: "",
  };
}

test("project chats select only the matching project", () => {
  const chats = [chat("a", "project"), chat("b", "other"), chat("c", "")];

  assert.deepEqual(
    projectChats(chats, "project").map((entry) => entry.id),
    ["a"],
  );
});

test("project chats select nothing for an unknown project", () => {
  const chats = [chat("a", "project")];

  assert.deepEqual(projectChats(chats, "missing"), []);
  assert.deepEqual(projectChats([], "project"), []);
});

test("clearable project chats skip running chats", () => {
  const chats = [
    chat("idle", "project"),
    chat("busy", "project", { running: true }),
  ];

  assert.deepEqual(
    projectChats(chats, "project").map((entry) => entry.id),
    ["idle", "busy"],
  );
  assert.deepEqual(
    clearableProjectChats(chats, "project").map((entry) => entry.id),
    ["idle"],
  );
});
