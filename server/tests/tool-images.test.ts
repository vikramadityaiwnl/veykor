import { test } from "node:test";
import assert from "node:assert/strict";
import { imageMimeType, isInsideFolder, savedScreenshotPaths, screenshotName } from "../src/chat/tool-images.js";

test("saved screenshot paths are extracted from browser tool output", () => {
  assert.deepEqual(
    savedScreenshotPaths(
      "Took a screenshot of the current page's viewport.\nSaved screenshot to /tmp/work/page.png.",
    ),
    ["/tmp/work/page.png"],
  );
  assert.deepEqual(
    savedScreenshotPaths(
      "Saved screenshot to /tmp/work/a.jpeg\nSaved screenshot to /tmp/work/a.jpeg\nSaved screenshot to /tmp/work/b.webp.",
    ),
    ["/tmp/work/a.jpeg", "/tmp/work/b.webp"],
  );
});

test("saved screenshot paths ignore inline images and non image files", () => {
  assert.deepEqual(
    savedScreenshotPaths(
      "Took a screenshot of the current page's viewport.\n[MCP image content: media_type=image/png, bytes=244135]",
    ),
    [],
  );
  assert.deepEqual(
    savedScreenshotPaths("Saved screenshot to /tmp/work/notes.txt."),
    [],
  );
  assert.deepEqual(
    savedScreenshotPaths("Saved screenshot to relative/page.png."),
    [],
  );
  assert.deepEqual(savedScreenshotPaths(""), []);
});

test("tool images stay inside the conversation folder", () => {
  assert.equal(isInsideFolder("/tmp/work", "/tmp/work/page.png"), true);
  assert.equal(isInsideFolder("/tmp/work", "/tmp/work/sub/page.png"), true);
  assert.equal(isInsideFolder("/tmp/work", "/tmp/other/page.png"), false);
  assert.equal(
    isInsideFolder("/tmp/work", "/tmp/work/../other/page.png"),
    false,
  );
  assert.equal(isInsideFolder("/tmp/work", "/tmp/work"), true);
});

test("tool image names and media types come from the saved file", () => {
  assert.equal(screenshotName("/tmp/work/my page.png"), "my page.png");
  assert.equal(imageMimeType("/tmp/work/page.PNG"), "image/png");
  assert.equal(imageMimeType("/tmp/work/page.jpg"), "image/jpeg");
  assert.equal(imageMimeType("/tmp/work/page.webp"), "image/webp");
  assert.equal(imageMimeType("/tmp/work/page.gif"), "");
});
