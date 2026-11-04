import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildSecretPatch,
  secretRowsError,
} from "../src/integrations/secret-rows.ts";
import type { SecretRow } from "../src/integrations/secret-rows.ts";

function row(partial: Partial<SecretRow> & { id: string }): SecretRow {
  return {
    name: "",
    value: "",
    savedName: null,
    ...partial,
  };
}

test("secret rows retain saved values when left blank", () => {
  assert.deepEqual(
    buildSecretPatch(
      ["API_KEY"],
      [row({ id: "a", name: "API_KEY", value: "", savedName: "API_KEY" })],
    ),
    {},
  );
});

test("secret rows replace, remove, and rename saved secrets", () => {
  assert.deepEqual(
    buildSecretPatch(
      ["API_KEY", "OLD"],
      [
        row({
          id: "a",
          name: "API_KEY",
          value: "rotated",
          savedName: "API_KEY",
        }),
        row({ id: "b", name: "RENAMED", value: "moved", savedName: "OLD" }),
        row({ id: "c", name: "EXTRA", value: "added", savedName: null }),
      ],
    ),
    { API_KEY: "rotated", OLD: null, RENAMED: "moved", EXTRA: "added" },
  );

  assert.deepEqual(buildSecretPatch(["GONE"], []), { GONE: null });
});

test("secret rows flag blank, duplicate, and invalid names", () => {
  assert.notEqual(secretRowsError("env", [row({ id: "a", name: "  " })]), "");

  assert.notEqual(
    secretRowsError("env", [
      row({ id: "a", name: "API_KEY", value: "one" }),
      row({ id: "b", name: "API_KEY", value: "two" }),
    ]),
    "",
  );

  assert.notEqual(
    secretRowsError("headers", [
      row({ id: "a", name: "X-Key", value: "one" }),
      row({ id: "b", name: "x-key", value: "two" }),
    ]),
    "",
  );

  assert.notEqual(
    secretRowsError("env", [row({ id: "a", name: "bad name", value: "x" })]),
    "",
  );

  assert.notEqual(
    secretRowsError("env", [row({ id: "a", name: "API_KEY", value: "" })]),
    "",
  );

  assert.equal(
    secretRowsError("env", [
      row({ id: "a", name: "API_KEY", value: "", savedName: "API_KEY" }),
    ]),
    "",
  );
});
