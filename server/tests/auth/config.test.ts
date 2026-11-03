import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  loadDatabaseUrl,
  loadDotEnvFile,
  loadPort,
  requiredEnv,
} from "../../src/auth/config.js";

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

test("dotenv file loading fills missing values without overriding", () => {
  const folder = mkdtempSync(join(tmpdir(), "veykor-env-"));

  try {
    writeFileSync(
      join(folder, ".env"),
      [
        "# veykor local configuration",
        "",
        "VEYKOR_TEST_HOST=value-from-file",
        "  VEYKOR_TEST_PADDED  =  padded-value  ",
        'VEYKOR_TEST_QUOTED="quoted value"',
        "VEYKOR_TEST_SINGLE='single value'",
        "not-a-pair",
        "",
      ].join("\n"),
    );

    withEnv(
      {
        VEYKOR_TEST_HOST: undefined,
        VEYKOR_TEST_PADDED: undefined,
        VEYKOR_TEST_QUOTED: undefined,
        VEYKOR_TEST_SINGLE: undefined,
        VEYKOR_TEST_KEEP: "from-environment",
      },
      () => {
        writeFileSync(
          join(folder, ".env"),
          "VEYKOR_TEST_KEEP=value-from-file\n",
          { flag: "a" },
        );

        loadDotEnvFile(folder);

        assert.equal(process.env["VEYKOR_TEST_HOST"], "value-from-file");
        assert.equal(process.env["VEYKOR_TEST_PADDED"], "padded-value");
        assert.equal(process.env["VEYKOR_TEST_QUOTED"], "quoted value");
        assert.equal(process.env["VEYKOR_TEST_SINGLE"], "single value");
        assert.equal(process.env["VEYKOR_TEST_KEEP"], "from-environment");
      },
    );
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

test("dotenv file loading ignores a missing file", () => {
  const folder = mkdtempSync(join(tmpdir(), "veykor-env-"));

  try {
    withEnv({ VEYKOR_TEST_ABSENT: undefined }, () => {
      loadDotEnvFile(folder);

      assert.equal(process.env["VEYKOR_TEST_ABSENT"], undefined);
    });
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});
