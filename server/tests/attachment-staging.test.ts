import assert from "node:assert/strict";
import { test } from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const execute = promisify(execFile);

test("different databases cannot sweep each other's staged attachments", async () => {
  const folder = mkdtempSync(join(tmpdir(), "veykor-staging-"));
  const id = crypto.randomUUID();
  const moduleUrl = new URL("../src/chat/attachments.ts", import.meta.url).href;

  async function run(database: string, operation: string) {
    const code = `import { stageAttachment, attachmentBytes, sweepStaging } from ${JSON.stringify(moduleUrl)}; ${operation}`;
    return execute(
      process.execPath,
      ["--import", "tsx", "--input-type=module", "-e", code],
      {
        env: {
          ...process.env,
          NODE_ENV: "test",
          JWT_SECRET: "staging-test-secret-with-at-least-thirty-two-bytes",
          DATABASE_URL: join(folder, database),
          AUTH_COOKIE_SECURE: "false",
          AUTH_ORIGINS: "http://localhost:31993",
          PORT: "31993",
        },
      },
    );
  }

  try {
    await run(
      "first.db",
      `await stageAttachment(${JSON.stringify(id)}, Buffer.from("first database image"));`,
    );
    await run(
      "second.db",
      `await stageAttachment(${JSON.stringify(id)}, Buffer.from("second database image")); await sweepStaging(new Set());`,
    );
    const result = await run(
      "first.db",
      `console.log((await attachmentBytes(${JSON.stringify(id)}))?.toString()); await sweepStaging(new Set());`,
    );
    assert.equal(result.stdout.trim(), "first database image");
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});
