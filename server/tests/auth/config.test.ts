import assert from "node:assert/strict";
import { test } from "node:test";
import { loadDatabaseUrl, loadPort, requiredEnv } from "../../src/auth/config.js";

function withEnv(
  values: Record<string, string | undefined>,
  run: () => void,
): void {
  const saved = new Map<string, string | undefined>();

  for (const name of Object.keys(values)) {
    saved.set(name, process.env[name]);

    const value = values[name];

    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }

  try {
    run();
  } finally {
    for (const [name, value] of saved) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  }
}

test("required environment values reject missing or blank input", () => {
  withEnv({ VEYKOR_TEST_VALUE: undefined }, () => {
    assert.throws(() => requiredEnv("VEYKOR_TEST_VALUE"), /VEYKOR_TEST_VALUE/);
  });

  withEnv({ VEYKOR_TEST_VALUE: "   " }, () => {
    assert.throws(() => requiredEnv("VEYKOR_TEST_VALUE"), /VEYKOR_TEST_VALUE/);
  });

  withEnv({ VEYKOR_TEST_VALUE: "ready" }, () => {
    assert.equal(requiredEnv("VEYKOR_TEST_VALUE"), "ready");
  });
});

test("port loading accepts valid ports and rejects the rest", () => {
  withEnv({ PORT: "3001" }, () => {
    assert.equal(loadPort(), 3001);
  });

  for (const port of ["0", "65536", "-1", "abc", "3001.5", ""]) {
    withEnv({ PORT: port }, () => {
      assert.throws(() => loadPort(), /PORT/);
    });
  }
});

test("database url loading requires a value", () => {
  withEnv({ DATABASE_URL: "./data/veykor.db" }, () => {
    assert.equal(loadDatabaseUrl(), "./data/veykor.db");
  });

  withEnv({ DATABASE_URL: undefined }, () => {
    assert.throws(() => loadDatabaseUrl(), /DATABASE_URL/);
  });
});
