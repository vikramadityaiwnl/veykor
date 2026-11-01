import { test } from "node:test";
import assert from "node:assert/strict";
import { isImageFile, openInNewTab } from "../src/workspace/chat-attachments";

test("only image files pass the attachment gate", () => {
  assert.equal(
    isImageFile(new File(["x"], "photo.png", { type: "image/png" })),
    true,
  );
  assert.equal(
    isImageFile(new File(["x"], "photo.jpg", { type: "image/jpeg" })),
    true,
  );
  assert.equal(
    isImageFile(new File(["x"], "doc.pdf", { type: "application/pdf" })),
    false,
  );
  assert.equal(
    isImageFile(new File(["x"], "clip.mp4", { type: "video/mp4" })),
    false,
  );
  assert.equal(
    isImageFile(new File(["x"], "notes.txt", { type: "text/plain" })),
    false,
  );
});

test("attachments open in a new tab without navigating away", () => {
  const opened: string[] = [];
  const globalWindow = globalThis as { window?: unknown };
  const previousWindow = globalWindow.window;
  globalWindow.window = {
    open: (url: string) => {
      opened.push(url);
      return null;
    },
  };

  try {
    openInNewTab("data:image/png;base64,aGk=");
    assert.equal(opened.length, 1);
    assert.ok(opened[0].startsWith("blob:"));
    openInNewTab("https://example.com/image.png");
    assert.equal(opened[1], "https://example.com/image.png");
    openInNewTab("");
    assert.equal(opened.length, 2);
  } finally {
    globalWindow.window = previousWindow;
  }
});
