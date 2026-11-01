import { test } from "node:test";
import assert from "node:assert/strict";
import type { AuthStatus, SettingsResponse } from "@veykor/shared";
import { useAuthStore } from "../src/auth/auth-store";
import { useSettingsStore } from "../src/settings/settings-store";

function session(id: number): AuthStatus {
  return {
    user: { id, username: `user-${id}`, photo: null },
    registrationAllowed: true,
    expiresAt: 9999999999,
  };
}

const settings: SettingsResponse = {
  providers: [
    {
      id: "muse",
      cli: "muse",
      name: "Muse Code",
      label: "Muse Code",
      company: "Meta",
      installed: true,
      version: "1.0",
      available: true,
      error: "",
      source: "test",
      models: [],
    },
  ],
};

test("settings store deduplicates loads, reuses data across views, and discards responses after account changes", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  let respond: (response: Response) => void = () => {};
  globalThis.fetch = async (url) => {
    assert.equal(url, "/api/settings");
    calls++;
    return new Promise<Response>((resolve) => {
      respond = resolve;
    });
  };

  try {
    useAuthStore.setState({ status: session(1) });
    const loading = useSettingsStore.getState().load();
    await useSettingsStore.getState().load();
    assert.equal(calls, 1);
    respond(Response.json(settings));
    await loading;
    assert.deepEqual(
      useSettingsStore
        .getState()
        .providers.filter((provider) => provider.id === "muse"),
      settings.providers,
    );
    assert.equal(useSettingsStore.getState().providers.length, 6);
    assert.equal(useSettingsStore.getState().providers.at(-1)?.id, "aider");
    assert.equal(
      useSettingsStore
        .getState()
        .providers.filter((provider) => provider.id !== "muse")
        .every(
          (provider) =>
            !provider.available && provider.source === "Coming soon",
        ),
      true,
    );
    await useSettingsStore.getState().load();
    assert.equal(calls, 1);

    useAuthStore.setState({ status: session(2) });
    assert.equal(useSettingsStore.getState().status, "idle");
    assert.deepEqual(useSettingsStore.getState().providers, []);
    const stale = useSettingsStore.getState().load();
    assert.equal(calls, 2);
    useAuthStore.setState({ status: session(3) });
    respond(Response.json(settings));
    await stale;
    assert.equal(useSettingsStore.getState().status, "idle");
    assert.deepEqual(useSettingsStore.getState().providers, []);

    const current = useSettingsStore.getState().load();
    respond(new Response("Unavailable", { status: 503 }));
    await current;
    assert.equal(useSettingsStore.getState().status, "error");
    const retry = useSettingsStore.getState().load();
    respond(Response.json(settings));
    await retry;
    assert.equal(useSettingsStore.getState().status, "ready");
    assert.equal(calls, 4);
  } finally {
    globalThis.fetch = originalFetch;
    useAuthStore.setState({ status: null });
  }
});
