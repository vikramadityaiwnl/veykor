import { test } from "node:test";
import assert from "node:assert/strict";
import type { AuthStatus, TranscriptionCatalogResponse, TranscriptionDefaults, TranscriptionKeyStatus } from "@veykor/shared";
import { useAuthStore } from "../src/auth/auth-store";
import { useTranscriptionDefaultsStore } from "../src/settings/transcription-defaults-store";

function session(id: number): AuthStatus {
  return {
    user: { id, username: `user-${id}`, photo: null },
    registrationAllowed: true,
    expiresAt: 9999999999,
  };
}

const catalog: TranscriptionCatalogResponse = {
  providers: [
    {
      id: "muse",
      name: "Muse Code",
      available: true,
      error: "",
      source: "test",
      models: [
        {
          id: "muse-voice-transcribe-1.0",
          name: "Muse Voice",
          description: "test model",
        },
      ],
    },
  ],
};

const lockedCatalog: TranscriptionCatalogResponse = {
  providers: [
    {
      id: "muse",
      name: "Muse Code",
      available: false,
      error: "test",
      source: "test",
      models: [],
    },
  ],
};

const defaults: TranscriptionDefaults = {
  providerId: "muse",
  modelId: "muse-voice-transcribe-1.0",
};

const keyStatus: TranscriptionKeyStatus = {
  configured: true,
  preview: "test…tion",
};

test("transcription store merges catalog with defaults, saves selections, and discards responses after account changes", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  let saved: unknown = null;
  let storedKey: unknown = null;
  let failSave = false;
  let failKey = false;
  let catalogs: TranscriptionCatalogResponse = catalog;
  globalThis.fetch = (async (url, init) => {
    calls++;

    if (url === "/api/settings/transcription-catalog") {
      return Response.json(catalogs);
    }

    if (url === "/api/settings/transcription-defaults") {
      if (init?.method === "PUT") {
        if (failSave) {
          return new Response("Unavailable", { status: 503 });
        }

        saved = JSON.parse(init.body as string);

        return Response.json(saved);
      }

      return Response.json(defaults);
    }

    if (url === "/api/settings/transcription-key") {
      if (init?.method === "PUT") {
        if (failKey) {
          return new Response("Unavailable", { status: 503 });
        }

        storedKey = JSON.parse(init.body as string);
        catalogs =
          (storedKey as { key: string }).key === "" ? lockedCatalog : catalog;

        return Response.json(
          (storedKey as { key: string }).key === ""
            ? { configured: false, preview: "" }
            : keyStatus,
        );
      }

      return Response.json(keyStatus);
    }

    throw new Error(`Unexpected request to ${url}`);
  }) as typeof fetch;

  try {
    useAuthStore.setState({ status: session(1) });
    const loading = useTranscriptionDefaultsStore.getState().load();
    await useTranscriptionDefaultsStore.getState().load();
    await loading;
    assert.equal(calls, 3);
    assert.deepEqual(
      useTranscriptionDefaultsStore.getState().providers,
      catalog.providers,
    );
    assert.equal(useTranscriptionDefaultsStore.getState().providerId, "muse");
    assert.equal(
      useTranscriptionDefaultsStore.getState().modelId,
      "muse-voice-transcribe-1.0",
    );
    assert.equal(useTranscriptionDefaultsStore.getState().keyConfigured, true);
    assert.equal(
      useTranscriptionDefaultsStore.getState().keyPreview,
      "test…tion",
    );
    assert.equal(useTranscriptionDefaultsStore.getState().status, "ready");

    await useTranscriptionDefaultsStore.getState().load();
    assert.equal(calls, 3);

    await useTranscriptionDefaultsStore
      .getState()
      .save("muse", "muse-voice-transcribe-1.0");
    assert.equal(calls, 3);
    assert.deepEqual(saved, null);

    await useTranscriptionDefaultsStore.getState().save("", "");
    assert.deepEqual(saved, { providerId: "", modelId: "" });
    assert.equal(useTranscriptionDefaultsStore.getState().providerId, "");
    assert.equal(useTranscriptionDefaultsStore.getState().modelId, "");

    failSave = true;
    await useTranscriptionDefaultsStore
      .getState()
      .save("muse", "muse-voice-transcribe-1.0");
    assert.equal(useTranscriptionDefaultsStore.getState().providerId, "");
    assert.equal(useTranscriptionDefaultsStore.getState().modelId, "");
    failSave = false;

    await useTranscriptionDefaultsStore.getState().saveKey("next-test-key");
    assert.deepEqual(storedKey, { key: "next-test-key" });
    assert.equal(useTranscriptionDefaultsStore.getState().keyConfigured, true);
    assert.equal(
      useTranscriptionDefaultsStore.getState().keyPreview,
      "test…tion",
    );
    assert.deepEqual(
      useTranscriptionDefaultsStore.getState().providers,
      catalog.providers,
    );

    await useTranscriptionDefaultsStore.getState().clearKey();
    assert.deepEqual(storedKey, { key: "" });
    assert.equal(useTranscriptionDefaultsStore.getState().keyConfigured, false);
    assert.equal(useTranscriptionDefaultsStore.getState().keyPreview, "");
    assert.deepEqual(
      useTranscriptionDefaultsStore.getState().providers,
      lockedCatalog.providers,
    );

    failKey = true;
    await assert.rejects(
      useTranscriptionDefaultsStore.getState().saveKey("another-key"),
    );
    assert.equal(useTranscriptionDefaultsStore.getState().keyConfigured, false);
    failKey = false;

    useAuthStore.setState({ status: session(2) });
    assert.equal(useTranscriptionDefaultsStore.getState().status, "idle");
    assert.deepEqual(useTranscriptionDefaultsStore.getState().providers, []);
    assert.equal(useTranscriptionDefaultsStore.getState().providerId, "");
    assert.equal(useTranscriptionDefaultsStore.getState().modelId, "");
    assert.equal(useTranscriptionDefaultsStore.getState().keyConfigured, false);
    assert.equal(useTranscriptionDefaultsStore.getState().keyPreview, "");
  } finally {
    globalThis.fetch = originalFetch;
    useAuthStore.setState({ status: null });
  }
});
