import assert from "node:assert/strict";
import { test } from "node:test";
import type { ChatSummary, SidebarSection } from "@veykor/shared";
import {
  clearableSectionChats,
  sectionChats,
} from "../src/chat/section-chats.ts";

function section(id: string): SidebarSection {
  return { id, title: id, open: true };
}

function chat(
  id: string,
  sectionId: string,
  options: { projectId?: string; running?: boolean } = {},
): ChatSummary {
  return {
    id,
    title: id,
    sectionId,
    projectId: options.projectId ?? "",
    agentId: "",
    agentName: "",
    museSessionId: "",
    running: options.running ?? false,
    createdAt: "",
    updatedAt: "",
  };
}

test("section chats resolve unknown sections to recent", () => {
  const sections = [section("recent"), section("archive")];
  const chats = [chat("a", "missing"), chat("b", "archive")];

  assert.deepEqual(
    sectionChats(chats, sections, "recent").map((entry) => entry.id),
    ["a"],
  );
  assert.deepEqual(
    sectionChats(chats, sections, "archive").map((entry) => entry.id),
    ["b"],
  );
});

test("section chats fall back to the first section without recent", () => {
  const sections = [section("archive")];
  const chats = [chat("a", "missing")];

  assert.deepEqual(
    sectionChats(chats, sections, "archive").map((entry) => entry.id),
    ["a"],
  );
});

test("section chats exclude project sessions", () => {
  const sections = [section("recent")];
  const chats = [
    chat("a", "recent"),
    chat("b", "recent", { projectId: "project" }),
  ];

  assert.deepEqual(
    sectionChats(chats, sections, "recent").map((entry) => entry.id),
    ["a"],
  );
});

test("clearable chats skip running chats", () => {
  const sections = [section("recent")];
  const chats = [
    chat("idle", "recent"),
    chat("busy", "recent", { running: true }),
  ];

  assert.deepEqual(
    sectionChats(chats, sections, "recent").map((entry) => entry.id),
    ["idle", "busy"],
  );
  assert.deepEqual(
    clearableSectionChats(chats, sections, "recent").map((entry) => entry.id),
    ["idle"],
  );
});

test("section chats select nothing without sections", () => {
  const chats = [chat("a", "recent")];

  assert.deepEqual(sectionChats(chats, [], "recent"), []);
  assert.deepEqual(clearableSectionChats(chats, [], "recent"), []);
});
