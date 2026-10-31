import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseOpenCodeModels } from "../src/chat/model-catalog.js";
import { validChatRequest } from "../src/chat/chat-runner.js";
import { runCli } from "../src/chat/cli-process.js";
import type { ChatEvent, ChatSession, SettingsResponse } from "@veykor/shared";

const input = {
  providerId: "claude",
  modelId: "sonnet",
  systemPrompt: "Be concise",
  messages: [{ role: "user", text: "Hello" }],
};

const usage = {
  inputTokens: 12,
  outputTokens: 3,
  cost: 0.02,
  costAvailable: true,
};

test("chat validation and OpenCode metadata preserve unknown versus free prices", () => {
  assert.equal(validChatRequest(input), true);
  for (const value of [
    null,
    [],
    {},
    { ...input, providerId: "sh" },
    { ...input, modelId: "--evil" },
    { ...input, messages: [] },
    { ...input, messages: [null] },
    { ...input, systemPrompt: 123 },
    { ...input, messages: [{ role: "system", text: "bad" }] },
  ]) {
    assert.equal(validChatRequest(value), false);
  }
  const models = parseOpenCodeModels(
    'test/free\n{\n"name":"Free", "cost":{"input":0,"output":0}, "limit":{"context":128000}\n}\ntest/unknown\n{\n"name":"Unknown"\n}\n',
  );
  assert.equal(models.length, 2);
  assert.equal(models[0].contextWindow, 128000);
  assert.equal(models[0].pricingAvailable, true);
  assert.equal(models[0].inputPrice, 0);
  assert.equal(models[1].pricingAvailable, false);
});

test("CLI runner rejects missing executables, stops on abort and enforces timeout", async () => {
  await assert.rejects(
    runCli("veykor-missing-test-command", []),
    /Unable to start/,
  );
  await assert.rejects(
    runCli(process.execPath, ["-e", "setInterval(()=>{}, 1000)"], {
      timeout: 30,
    }),
    /timed out/,
  );
  const controller = new AbortController();
  const running = runCli(
    process.execPath,
    ["-e", "setInterval(()=>{}, 1000)"],
    { signal: controller.signal },
  );
  controller.abort();
  await assert.rejects(running, /stopped/);
});

test("chat API authenticates, validates, streams all adapters, isolates saved histories, and survives restart", async () => {
  const folder = mkdtempSync(join(tmpdir(), "veykor-chat-test-"));
  const origin = "http://localhost:31985";
  let child: ChildProcess | undefined;
  const fixture = `#!${process.execPath}
const args = process.argv.slice(2);
const provider = process.argv[1].split('/').pop();
if(args.includes('--version')) {
  if(provider === 'aider' || (['claude','codex'].includes(provider) && require('node:fs').existsSync(require('node:path').join(__dirname, 'removed-tools')))) process.exit(1);
  console.log('test 1.0'); process.exit(0);
}
if(args[0] === 'serve') { console.log(JSON.stringify({id:2,result:{models:[{modelId:'muse-test',displayLabel:'Muse Test',contextLimit:100000,cost:{input:'1',output:'2',currency:'USD'}}]}})); process.exit(0); }
if(args[0] === 'models') { console.log('test/model\\n{\\n"name":"Test", "cost":{"input":1,"output":2}, "limit":{"context":128000}\\n}'); process.exit(0); }
let prompt='';
process.stdin.on('data', value => prompt += value);
process.stdin.on('end', () => {
  const model = args[args.indexOf('--model')+1];
  if(model === 'failure') { console.error('Failed'); process.exit(1); }
  const emit = value => console.log(JSON.stringify(value));
  if(model === 'slow') { emit({type:'text', part:{text:'Started'}}); setInterval(()=>{},1000); return; }
  if(provider === 'muse') { prompt = require('node:fs').readFileSync(args[args.indexOf('--prompt-file')+1], 'utf8'); }
  const text = JSON.parse(prompt.split('\\n')[1]).messages.map(message => message.text).join(' | ');
  if(provider === 'muse') {
    emit({payload_type:'run.output.delta',payload:{text}});
    emit({payload_type:'run.usage',payload:{models:[{input_tokens:12,output_tokens:3}]}});
    emit({payload_type:'run.terminal.completed',payload:{text}});
  } else if(provider === 'claude') {
    if(!args.includes('--tools') || args[args.indexOf('--tools')+1] !== '') process.exit(2);
    emit({type:'assistant', message:{content:[{type:'text',text}]}});
    emit({type:'result', result:text, usage:{input_tokens:12,output_tokens:3}, total_cost_usd:0.02});
  } else if(provider === 'codex') {
    if(!args.includes('read-only')) process.exit(2);
    emit({type:'item.completed',item:{type:'agent_message',text}});
    emit({type:'turn.completed',usage:{input_tokens:12,output_tokens:3}});
  } else {
    if(process.env.OPENCODE_PERMISSION !== '{"*":"deny"}') process.exit(2);
    emit({type:'text',part:{text}});
    emit({type:'step_finish',part:{tokens:{input:12,output:3},cost:0.02}});
  }
});
`;
  for (const cli of ["aider", "muse", "claude", "codex", "opencode"]) {
    writeFileSync(join(folder, cli), fixture, { mode: 0o755 });
  }

  async function start() {
    child = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
      cwd: new URL("..", import.meta.url).pathname,
      env: {
        ...process.env,
        PATH: `${folder}:${process.env.PATH}`,
        NODE_ENV: "test",
        JWT_SECRET: "test-secret-with-at-least-thirty-two-characters",
        PORT: "31985",
        DATABASE_URL: join(folder, "test.db"),
        AUTH_COOKIE_SECURE: "false",
        AUTH_ORIGINS: origin,
      },
      stdio: "pipe",
    });
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Startup timeout")),
        10000,
      );
      child!.once("error", reject);
      child!.stdout!.on("data", (data) => {
        if (String(data).includes("listening")) {
          clearTimeout(timer);
          resolve();
        }
      });
      child!.stderr!.on("data", (data) => {
        clearTimeout(timer);
        reject(new Error(String(data)));
      });
    });
  }

  async function stop() {
    if (child && child.exitCode === null) {
      const exit = new Promise<void>((resolve) =>
        child!.once("exit", () => resolve()),
      );
      child.kill();
      await exit;
    }
  }

  async function request(
    path: string,
    cookie = "",
    body?: unknown,
    method = body === undefined ? "GET" : "POST",
    signal?: AbortSignal,
  ) {
    return fetch(origin + "/api/" + path, {
      method,
      signal,
      headers: {
        Origin: origin,
        "X-Veykor-Request": "1",
        "Content-Type": "application/json",
        Cookie: cookie,
        Connection: "close",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  async function register(username: string) {
    const response = await request("auth/register", "", {
      username,
      password: "a-long-test-password",
    });
    assert.equal(response.status, 200);
    return response.headers.get("set-cookie")!.split(";")[0];
  }

  try {
    await start();
    assert.equal((await request("settings")).status, 401);
    assert.equal((await request("chat/sessions")).status, 401);
    assert.equal((await request("chat", "", input)).status, 401);
    const cookie = await register("chatuser");
    const other = await register("otheruser");
    const catalog = await request("settings", cookie);
    assert.equal(catalog.status, 200);
    const providers = ((await catalog.json()) as SettingsResponse).providers;
    assert.deepEqual(
      providers.map((provider) => provider.id),
      ["claude", "codex", "muse", "opencode", "aider"],
    );
    assert.equal(providers.at(-1)!.installed, false);
    assert.equal(providers.at(-1)!.version, "");
    assert.deepEqual(providers.at(-1)!.models, []);
    assert.deepEqual(await (await request("chat/sessions", cookie)).json(), {
      sessions: [],
    });
    writeFileSync(join(folder, "removed-tools"), "");
    const updated = await request("settings", cookie);
    const refreshedProviders = ((await updated.json()) as SettingsResponse)
      .providers;
    assert.deepEqual(
      refreshedProviders.map((provider) => provider.id),
      ["muse", "opencode", "aider", "claude", "codex"],
    );
    assert.deepEqual(
      refreshedProviders.map((provider) => provider.installed),
      [true, true, false, false, false],
    );
    rmSync(join(folder, "removed-tools"));
    await (await request("settings", cookie)).json();

    assert.ok(
      providers.filter((provider: { available: boolean }) => provider.available)
        .length === 4,
    );
    assert.equal(
      providers.find((provider: { id: string }) => provider.id === "opencode")!
        .models[0].contextWindow,
      128000,
    );
    for (const body of [
      null,
      {},
      { ...input, modelId: "--flag" },
      { ...input, messages: [] },
    ]) {
      assert.equal((await request("chat", cookie, body)).status, 400);
    }
    assert.equal(
      (
        await request("chat", cookie, {
          ...input,
          systemPrompt: "x".repeat(1_000_001),
        })
      ).status,
      413,
    );
    const csrf = await fetch(origin + "/api/chat", {
      method: "POST",
      body: JSON.stringify(input),
      headers: { Cookie: cookie, "Content-Type": "application/json" },
    });
    assert.equal(csrf.status, 403);

    for (const providerId of ["muse", "claude", "codex", "opencode"]) {
      const response = await request("chat", cookie, {
        ...input,
        providerId,
        messages: [
          { role: "user", text: "First" },
          { role: "assistant", text: "Reply" },
          { role: "user", text: "Follow-up" },
        ],
      });
      assert.equal(response.status, 200);
      assert.match(
        response.headers.get("content-type")!,
        /application\/x-ndjson/,
      );
      const events: ChatEvent[] = (await response.text())
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));
      assert.deepEqual(events[0], {
        type: "text",
        text: "First | Reply | Follow-up",
      });
      const usageEvent = events.find((event) => event.type === "usage");
      assert.equal(
        usageEvent?.type === "usage" && usageEvent.usage.inputTokens,
        12,
      );
      assert.deepEqual(events.at(-1), { type: "done" });
    }
    const failure = await request("chat", cookie, {
      ...input,
      modelId: "failure",
    });
    assert.equal(JSON.parse((await failure.text()).trim()).type, "error");

    const abort = new AbortController();
    const slow = await request(
      "chat",
      cookie,
      { ...input, providerId: "opencode", modelId: "slow" },
      "POST",
      abort.signal,
    );
    const reader = slow.body!.getReader();
    await reader.read();
    assert.equal((await request("chat", cookie, input)).status, 409);
    abort.abort();
    await reader.cancel().catch(() => {});
    let next: Response | undefined;
    for (let attempt = 0; attempt < 20; attempt++) {
      next = await request("chat", cookie, input);
      if (next.status !== 409) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    assert.equal(next!.status, 200);
    await next!.text();

    assert.deepEqual(await (await request("chat/sessions", cookie)).json(), {
      sessions: [],
    });
    const session: ChatSession = {
      id: "session-one",
      title: "Hello",
      projectId: null,
      sectionId: "chats",
      providerId: "claude",
      modelId: "sonnet",
      messages: [{ id: "message-one", role: "user", text: "Hello", usage }],
    };
    assert.equal(
      (await request("chat/sessions", cookie, { sessions: [session] }, "PUT"))
        .status,
      200,
    );
    assert.equal(
      (
        await request(
          "chat/sessions",
          cookie,
          { sessions: [{ ...session, messages: [] }] },
          "PUT",
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await request(
          "chat/sessions",
          cookie,
          { sessions: [session, session] },
          "PUT",
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await request(
          "chat/sessions",
          cookie,
          { sessions: [{ ...session, messages: [null] }] },
          "PUT",
        )
      ).status,
      400,
    );
    assert.deepEqual(await (await request("chat/sessions", other)).json(), {
      sessions: [],
    });
    const renamed = { ...session, title: "Renamed conversation" };
    assert.equal(
      (await request("chat/sessions", cookie, { sessions: [renamed] }, "PUT"))
        .status,
      200,
    );
    await stop();
    await start();
    assert.deepEqual(await (await request("chat/sessions", cookie)).json(), {
      sessions: [renamed],
    });
    const restored = (await (
      await request("chat/sessions", cookie)
    ).json()) as { sessions: ChatSession[] };
    const continuation = await request("chat", cookie, {
      ...input,
      providerId: restored.sessions[0].providerId,
      modelId: restored.sessions[0].modelId,
      messages: [
        ...restored.sessions[0].messages.map((message) => ({
          role: message.role,
          text: message.text,
        })),
        { role: "user", text: "Continue our conversation" },
      ],
    });
    assert.equal(continuation.status, 200);
    const continuationEvents = (await continuation.text())
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as ChatEvent);
    assert.deepEqual(continuationEvents[0], {
      type: "text",
      text: "Hello | Continue our conversation",
    });
    assert.deepEqual(continuationEvents.at(-1), { type: "done" });

    assert.equal(
      (await request("chat/sessions", cookie, { sessions: [] }, "PUT")).status,
      200,
    );
    await stop();
    await start();
    assert.deepEqual(await (await request("chat/sessions", cookie)).json(), {
      sessions: [],
    });
    assert.deepEqual(await (await request("chat/sessions", other)).json(), {
      sessions: [],
    });
  } finally {
    await stop();
    rmSync(folder, { recursive: true, force: true });
  }
});
