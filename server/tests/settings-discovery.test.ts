import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("provider discovery runs independently and coalesces concurrent and cached requests", async () => {
  const folder = mkdtempSync(join(tmpdir(), "veykor-settings-"));
  Object.assign(process.env, {
    NODE_ENV: "test",
    JWT_SECRET: "settings-test-secret-with-at-least-thirty-two-bytes",
    AUTH_COOKIE_SECURE: "false",
    AUTH_ORIGINS: "http://localhost:31990",
    DATABASE_URL: join(folder, "test.db"),
    PORT: "31990",
  });
  const { providerRegistration, knownProviderIds } =
    await import("../src/providers/index.js");
  const { getSettings } = await import("../src/settings/settings.js");
  const registrations = knownProviderIds().map((id) =>
    providerRegistration(id)!,
  );
  const original = registrations.map((registration) => ({
    detectCLI: registration.detectCLI,
    discoverCatalog: registration.discoverCatalog,
  }));
  const calls: string[] = [];
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });

  for (const [index, registration] of registrations.entries()) {
    registration.detectCLI = async () => {
      calls.push(knownProviderIds()[index]);
      await gate;
      return { installed: true, version: "test-version" };
    };
    registration.discoverCatalog = async () => {
      if (index === 1) {
        throw new Error("OpenCode catalog failed");
      }
      return {
        id: "muse",
        name: "Muse Code",
        available: true,
        error: "",
        source: "test",
        models: [],
      };
    };
  }

  try {
    const first = getSettings(true);
    const second = getSettings(true);
    assert.equal(first, second);
    assert.deepEqual(calls, ["muse", "opencode"]);
    release();
    const result = await first;
    assert.equal(result.providers[0].available, true);
    assert.equal(result.providers[0].version, "test-version");
    assert.equal(result.providers[1].installed, true);
    assert.equal(result.providers[1].available, false);
    assert.equal(result.providers[1].error, "OpenCode catalog failed");
    assert.equal(await getSettings(), result);
    assert.deepEqual(calls, ["muse", "opencode"]);
  } finally {
    release();
    for (const [index, registration] of registrations.entries()) {
      Object.assign(registration, original[index]);
    }
    rmSync(folder, { recursive: true, force: true });
  }
});
