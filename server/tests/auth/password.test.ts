import assert from "node:assert/strict";
import { test } from "node:test";
import { hashPassword, verifyPassword } from "../../src/auth/password.js";

test("password hashing verifies the correct password only", async () => {
  const hash = await hashPassword("a-strong-test-password");

  assert.equal(await verifyPassword("a-strong-test-password", hash), true);
  assert.equal(await verifyPassword("wrong-password", hash), false);
  assert.equal(await verifyPassword("", hash), false);
});

test("password hashing salts every hash", async () => {
  const first = await hashPassword("same-password");
  const second = await hashPassword("same-password");

  assert.notEqual(first, second);
  assert.equal(await verifyPassword("same-password", first), true);
  assert.equal(await verifyPassword("same-password", second), true);
});

test("password verification rejects malformed stored values", async () => {
  const malformed = [
    "",
    "not-a-hash",
    "v1$only-two-parts",
    "v2$abc123$def456",
    "v1$zzzz$zzzz",
    "v1$00$11",
  ];

  for (const stored of malformed) {
    assert.equal(await verifyPassword("anything", stored), false);
  }
});
