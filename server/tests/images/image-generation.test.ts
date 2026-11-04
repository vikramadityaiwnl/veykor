import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const folder = mkdtempSync(join(tmpdir(), "veykor-image-generation-"));

process.env["DATABASE_URL"] = join(folder, "images.db");

const shared = await import("@veykor/shared");
const service = await import("../../src/images/image-service.ts");

test("image prompts need text under the length limit", () => {
  assert.notEqual(shared.validateImagePrompt(""), "");
  assert.notEqual(shared.validateImagePrompt("   "), "");
  assert.equal(shared.validateImagePrompt("a red fox in snow"), "");
  assert.equal(shared.validateImagePrompt("x".repeat(4000)), "");
  assert.notEqual(shared.validateImagePrompt("x".repeat(4001)), "");
});

test("image sizes accept WxH ratios within 16:1", () => {
  assert.equal(shared.validateImageSize(""), "");
  assert.equal(shared.validateImageSize("1792x1024"), "");
  assert.equal(shared.validateImageSize("1024x1024"), "");
  assert.equal(shared.validateImageSize(" 1792x1024 "), "");
  assert.notEqual(shared.validateImageSize("large"), "");
  assert.notEqual(shared.validateImageSize("1024"), "");
  assert.notEqual(shared.validateImageSize("0x1024"), "");
  assert.notEqual(shared.validateImageSize("17000x100"), "");
  assert.notEqual(shared.validateImageSize("100x17000"), "");
  assert.notEqual(shared.validateImageSize("9000x9000"), "");
});

test("history matching finds the image tool and its artifact ids", () => {
  assert.equal(
    shared.isGenerateImageTool("mcp__veykor-images__generate_image"),
    true,
  );
  assert.equal(shared.isGenerateImageTool("generate_image"), true);
  assert.equal(shared.isGenerateImageTool("bash"), false);
  assert.equal(shared.isGenerateImageTool("team_delegate"), false);

  const first = `img_${"a".repeat(32)}`;
  const second = `img_${"b".repeat(32)}`;

  assert.deepEqual(
    shared.extractGeneratedImageIds(`{"artifactId":"${first}"} ${first}`),
    [first],
  );
  assert.deepEqual(shared.extractGeneratedImageIds(`see ${second} done`), [
    second,
  ]);
  assert.deepEqual(shared.extractGeneratedImageIds("no image here"), []);
});

test("artifact ids are opaque and unique", () => {
  const pattern = /^img_[0-9a-f]{32}$/;

  const first = service.newArtifactId();
  const second = service.newArtifactId();

  assert.match(first, pattern);
  assert.match(second, pattern);
  assert.notEqual(first, second);
});

test("generation responses need base64 data and a known format", () => {
  const parsed = service.parseGenerationPayload({
    data: [{ b64_json: "eA==" }],
    output_format: "png",
  });

  assert.equal(parsed.base64, "eA==");
  assert.equal(parsed.format, "png");

  assert.equal(
    service.parseGenerationPayload({ data: [{ b64_json: "eA==" }] }).format,
    "webp",
  );

  assert.throws(() => service.parseGenerationPayload({}), service.ImageFailure);
  assert.throws(
    () => service.parseGenerationPayload({ data: [] }),
    service.ImageFailure,
  );
  assert.throws(
    () =>
      service.parseGenerationPayload({
        data: [{ b64_json: "eA==" }],
        output_format: "gif",
      }),
    service.ImageFailure,
  );
});

test("upstream failures map to concise user-facing errors", () => {
  assert.match(
    service.upstreamErrorMessage(401, {}),
    /not authorized.*Meta API key/,
  );
  assert.match(service.upstreamErrorMessage(429, {}), /rate-limited/);
  assert.match(
    service.upstreamErrorMessage(400, {
      error: { code: "content_policy_violation", message: "blocked" },
    }),
    /safety filter/,
  );
  assert.equal(
    service.upstreamErrorMessage(400, {
      error: { message: "prompt is too long" },
    }),
    "prompt is too long",
  );
  assert.match(service.upstreamErrorMessage(503, {}), /busy/);
  assert.match(service.upstreamErrorMessage(500, {}), /failed/);
});

test("saved bytes must look like a real image", () => {
  const webp = Buffer.concat([
    Buffer.from("RIFF", "ascii"),
    Buffer.alloc(4),
    Buffer.from("WEBP", "ascii"),
  ]);

  assert.equal(service.sniffImageMediaType(webp), "image/webp");
  assert.equal(
    service.sniffImageMediaType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00])),
    "image/png",
  );
  assert.equal(
    service.sniffImageMediaType(Buffer.from([0xff, 0xd8, 0xff, 0x00])),
    "image/jpeg",
  );
  assert.equal(service.sniffImageMediaType(Buffer.from("hello")), "");
  assert.equal(service.sniffImageMediaType(Buffer.alloc(0)), "");
});
