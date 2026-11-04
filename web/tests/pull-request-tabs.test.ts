import assert from "node:assert/strict";
import { test } from "node:test";
import {
  parsePullRequestTab,
  pullRequestTabId,
} from "../src/teams/pull-request-tabs.ts";

test("pull request tab ids round-trip", () => {
  assert.equal(pullRequestTabId(12), "pr:12");
  assert.equal(parsePullRequestTab("pr:12"), 12);
});

test("member ids are not pull request tabs", () => {
  assert.equal(parsePullRequestTab("member-1"), 0);
  assert.equal(parsePullRequestTab(""), 0);
  assert.equal(parsePullRequestTab("pr:0"), 0);
  assert.equal(parsePullRequestTab("pr:abc"), 0);
});
