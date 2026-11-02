import { test } from "node:test";
import assert from "node:assert/strict";
import type { FoldedItem } from "../src/providers/muse/types.js";
import { museThoughtText } from "../src/providers/muse/thought-text.js";

function item(values: Partial<FoldedItem>): FoldedItem {
  return {
    itemId: "reasoning",
    kind: "reasoning",
    status: "inProgress",
    revision: 1,
    ...values,
  } as FoldedItem;
}

test("reasoning retains all streaming summary parts in numeric order and exposed text", () => {
  const fields: Record<string, string> = {
    "summary.1": "Second thought",
    "summary.0": "First thought",
    text: "Additional detail",
  };
  const stream = {
    accumulatedFields: () => Object.keys(fields),
    accumulated: (_id: string, field = "text") => fields[field],
  };
  assert.equal(
    museThoughtText(item({}), stream),
    "First thought\n\nSecond thought\n\nAdditional detail",
  );
});

test("durable reasoning retains all stored summary parts and distinct committed text", () => {
  const stream = { accumulatedFields: () => [], accumulated: () => "stale" };
  assert.equal(
    museThoughtText(
      item({
        status: "completed",
        summary: ["First", "Second"],
        text: "Full detail",
      }),
      stream,
    ),
    "First\n\nSecond\n\nFull detail",
  );
  assert.equal(
    museThoughtText(
      item({ status: "completed", summary: ["Same"], text: "Same" }),
      stream,
    ),
    "Same",
  );
});
