import assert from "node:assert/strict";
import { test } from "node:test";
import { avatarInitials } from "../src/components/avatar/avatar-initials.ts";

test("avatars use one initial per word up to two words", () => {
  assert.equal(avatarInitials("Planner"), "P");
  assert.equal(avatarInitials("Code Tester Agent"), "CT");
  assert.equal(avatarInitials("  Code   Tester  "), "CT");
  assert.equal(avatarInitials("Élodie Martin"), "ÉM");
  assert.equal(avatarInitials(""), "?");
  assert.equal(avatarInitials("Plan & Code"), "PC");
  assert.equal(avatarInitials("&"), "?");
  assert.equal(avatarInitials("(Reviewer)"), "R");
});
