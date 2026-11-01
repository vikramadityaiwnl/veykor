import Database from "better-sqlite3";
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import type { ChatAttachment, ChatSession, SidebarSectionsResponse, ProjectsResponse, SettingsResponse } from "@veykor/shared";

test(
  "real Muse native sessions: streaming, tools, approval, modes, reconnect, stop and cold resume",
  { timeout: 600_000 },
  async () => {
    const folder = mkdtempSync(join(tmpdir(), "veykor-native-e2e-"));
    const port = process.env.MUSE_E2E_PORT || "31996";
    const origin = `http://localhost:${port}`;
    let child: ChildProcess;
    let cookie = "";
    let conversationId = "";

    async function start() {
      child = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
        env: {
          ...process.env,
          NODE_ENV: "test",
          JWT_SECRET:
            "native-integration-test-secret-at-least-thirty-two-bytes",
          PORT: port,
          DATABASE_URL: relative(process.cwd(), join(folder, "test.db")),
          AUTH_COOKIE_SECURE: "false",
          AUTH_ORIGINS: origin,
        },
        stdio: "pipe",
      });
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error("Server startup timeout")),
          10_000,
        );
        child.stdout!.on("data", (data) => {
          if (String(data).includes("listening")) {
            clearTimeout(timer);
            resolve();
          }
        });
        child.stderr!.on("data", (data) => {
          clearTimeout(timer);
          reject(new Error(String(data)));
        });
        child.once("exit", (code) => {
          clearTimeout(timer);
          if (code) {
            reject(new Error(`Server exited ${code}`));
          }
        });
      });
    }

    async function stop() {
      if (child && child.exitCode === null) {
        await new Promise<void>((resolve) => {
          child.once("exit", () => resolve());
          child.kill();
        });
      }
    }

    async function request(
      path: string,
      body?: unknown,
      method = body === undefined ? "GET" : "POST",
      credentials = cookie,
    ) {
      return fetch(`${origin}/api/${path}`, {
        method,
        headers: {
          Origin: origin,
          "Content-Type": "application/json",
          "X-Veykor-Request": "1",
          Cookie: credentials,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    }

    async function json<T>(
      path: string,
      body?: unknown,
      method?: string,
    ): Promise<T> {
      const response = await request(path, body, method);
      const payload = await response.json();
      assert.ok(
        response.ok,
        `${path}: ${response.status} ${JSON.stringify(payload)}`,
      );
      return payload as T;
    }

    async function current(): Promise<ChatSession> {
      return (
        await json<{ session: ChatSession }>(`chat/sessions/${conversationId}`)
      ).session;
    }

    async function until(
      predicate: (session: ChatSession) => boolean,
    ): Promise<ChatSession> {
      const deadline = Date.now() + 120_000;
      while (Date.now() < deadline) {
        const session = await current();
        if (predicate(session)) {
          return session;
        }
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      throw new Error(
        `Native session timeout: ${JSON.stringify(await current())}`,
      );
    }

    async function send(
      text: string,
      permissionMode = "promptUnmatched",
      attachments: ChatAttachment[] = [],
    ) {
      await json("chat", {
        conversationId,
        messageId: crypto.randomUUID(),
        providerId: "muse",
        modelId: "muse-spark-1.3",
        permissionMode,
        systemPrompt: "",
        messages: [{ role: "user", text, attachments }],
      });
    }

    async function finished() {
      const session = await until((entry) => entry.status !== "running");
      assert.equal(session.error, "");
      return session;
    }

    try {
      await start();
      const registration = await request("auth/register", {
        username: "native-e2e",
        password: "native-test-password-long",
      });
      assert.equal(registration.status, 200);
      cookie = registration.headers.get("set-cookie")!.split(";")[0];
      const catalog = await json<SettingsResponse>("settings");
      assert.deepEqual(
        catalog.providers.map((provider) => provider.id),
        ["muse"],
      );
      assert.ok(
        catalog.providers[0].models.some(
          (model) => model.id === "muse-spark-1.3",
        ),
      );
      const sidebar = await json<SidebarSectionsResponse>("sidebar/sections");
      conversationId = crypto.randomUUID();
      const historyDb = new Database(join(folder, "test.db"));
      const oldUsage = {
        inputTokens: 0,
        outputTokens: 0,
        cost: 0,
        costAvailable: false,
      };
      const slimId = crypto.randomUUID();
      const slimAttachmentId = crypto.randomUUID();
      const slimBytes = Buffer.from("legacy staged attachment bytes");
      const chatsSection = sidebar.sections.find(
        (section) => section.kind === "chats",
      )!.id;
      historyDb
        .prepare(
          "INSERT INTO conversations (id, user_id, data) VALUES (?, ?, ?)",
        )
        .run(
          slimId,
          1,
          JSON.stringify({
            id: slimId,
            title: "Legacy slim",
            projectId: null,
            sectionId: chatsSection,
            providerId: "muse",
            modelId: "muse-spark-1.3",
            nativeSessionId: "",
            permissionMode: "promptUnmatched",
            status: "idle",
            error: "",
            approvals: [],
            activities: [],
            messages: [
              {
                id: crypto.randomUUID(),
                role: "user",
                text: "legacy slim check",
                usage: oldUsage,
                createdAt: Date.now(),
                tools: [],
                attachments: [
                  {
                    id: slimAttachmentId,
                    name: "note.txt",
                    mimeType: "text/plain",
                    size: slimBytes.length,
                    kind: "text",
                    dataUrl: `data:text/plain;base64,${slimBytes.toString("base64")}`,
                    text: "",
                  },
                ],
              },
            ],
          }),
        );
      historyDb
        .prepare("INSERT INTO chat_histories (user_id, sessions) VALUES (?, ?)")
        .run(
          1,
          JSON.stringify([
            {
              id: conversationId,
              title: "Legacy chat",
              projectId: null,
              sectionId: sidebar.sections.find(
                (section) => section.kind === "chats",
              )!.id,
              providerId: "claude",
              modelId: "sonnet",
              messages: [
                {
                  id: crypto.randomUUID(),
                  role: "user",
                  text: "The archive verification phrase is legacy-native-memory.",
                  usage: oldUsage,
                  createdAt: Date.now(),
                  tools: [],
                  attachments: [],
                },
              ],
            },
          ]),
        );
      historyDb.close();
      await stop();
      await start();
      await json("chat/sessions");
      const checkDb = new Database(join(folder, "test.db"));
      const slimmed = JSON.parse(
        (
          checkDb
            .prepare("SELECT data FROM conversations WHERE id = ?")
            .get(slimId) as { data: string }
        ).data,
      );
      assert.ok(!("messages" in slimmed));
      assert.equal(slimmed.attachments.length, 1);
      assert.ok(!("dataUrl" in slimmed.attachments[0]));
      assert.equal(slimmed.legacy.messages.length, 1);
      assert.deepEqual(
        checkDb.prepare("SELECT * FROM chat_histories WHERE user_id = 1").all(),
        [],
      );
      checkDb.close();
      const staged = await request(
        `chat/sessions/${slimId}/attachments/${slimAttachmentId}`,
      );
      assert.equal(staged.status, 200);
      assert.deepEqual(Buffer.from(await staged.arrayBuffer()), slimBytes);
      console.log("PASS stored transcripts slim to metadata with staged files");
      rmSync(join(tmpdir(), "veykor-uploads", slimAttachmentId));
      await stop();
      await start();
      const healed = await request(
        `chat/sessions/${slimId}/attachments/${slimAttachmentId}`,
      );
      assert.equal(healed.status, 200);
      assert.deepEqual(Buffer.from(await healed.arrayBuffer()), slimBytes);
      console.log("PASS wiped staged files heal from stored bytes on boot");
      await send(
        "What archive verification phrase did I tell you earlier? Reply briefly without using tools.",
      );
      assert.match(
        (await finished()).messages.at(-1)!.text,
        /legacy-native-memory/,
      );
      console.log(
        "PASS legacy conversation context migration into a native session",
      );

      conversationId = crypto.randomUUID();
      await json(
        "chat/sessions",
        {
          sessions: [
            {
              id: conversationId,
              title: "General native chat",
              projectId: null,
              sectionId: sidebar.sections.find(
                (section) => section.kind === "chats",
              )!.id,
              modelId: "muse-spark-1.3",
            },
          ],
        },
        "PUT",
      );
      await send(
        "Reply with exactly general-workspace-ready. Do not use tools.",
      );
      const general = await finished();
      assert.match(general.messages.at(-1)!.text, /general-workspace-ready/i);
      console.log("PASS general chat with a relative database path");
      const project = (
        await json<ProjectsResponse>("projects", {
          name: "Native integration",
          folder,
          sectionId: sidebar.sections.find(
            (section) => section.kind === "projects",
          )!.id,
        })
      ).projects[0];
      conversationId = crypto.randomUUID();
      const metadata = {
        id: conversationId,
        title: "Native integration",
        projectId: project.id,
        sectionId: null,
        modelId: "muse-spark-1.3",
        messages: [],
      };
      await json("chat/sessions", { sessions: [metadata] }, "PUT");

      await send("Reply with exactly native-stream-ready. Do not use tools.");
      const streaming = await until((entry) => !!entry.messages.at(-1)?.text);
      assert.match(streaming.messages.at(-1)!.text, /native-stream-ready/i);
      let session = await finished();
      assert.ok(session.nativeSessionId);
      const nativeSessionId = session.nativeSessionId;
      assert.ok(session.messages.at(-1)!.usage.inputTokens > 0);
      console.log(
        "PASS native creation, streaming, persisted usage and completion",
      );

      const reconnect = await request("chat/sessions/live");
      const reader = reconnect.body!.getReader();
      const snapshot = new TextDecoder().decode((await reader.read()).value);
      assert.match(snapshot, /native-stream-ready/);
      await reader.cancel();
      console.log("PASS reconnect to backend-owned state");

      await send(
        "Run exactly this shell command: printf native-tool-ok > native-tool-proof.txt . Use the shell tool, not an editor. Report the result.",
      );
      session = await until(
        (entry) => !!entry.approvals?.length || entry.status === "error",
      );
      assert.equal(session.error, "");
      const approval = session.approvals![0];
      assert.equal(existsSync(join(folder, "native-tool-proof.txt")), false);
      const allow = approval.choices.find((choice) =>
        /allow once/i.test(choice.label),
      )!;
      assert.ok(allow);
      await json(`chat/sessions/${conversationId}/approval`, {
        approvalId: approval.id,
        choiceId: allow.choiceId,
      });
      session = await finished();
      assert.equal(
        readFileSync(join(folder, "native-tool-proof.txt"), "utf8"),
        "native-tool-ok",
      );
      assert.ok(
        session.messages
          .at(-1)!
          .tools.some((tool) => tool.status === "complete"),
      );
      console.log("PASS native tool execution gated by real approval");

      for (const mode of [
        "onRequest",
        "denyUnmatched",
        "allowAll",
        "promptUnmatched",
      ]) {
        await json(`chat/sessions/${conversationId}/mode`, { mode });
        assert.equal((await current()).permissionMode, mode);
      }
      console.log("PASS four native permission modes");

      await send("Run exactly sleep 30 in the shell. Do nothing else first.");
      await until(
        (entry) =>
          !!entry.approvals?.length || !!entry.messages.at(-1)?.tools.length,
      );
      await json(`chat/sessions/${conversationId}/stop`, {});
      await finished();
      await send("Run exactly sleep 30 in the shell.");
      await until((entry) => entry.status === "running");
      await json(`chat/sessions/${conversationId}/stop`, { cancel: true });
      await finished();
      console.log("PASS native interruption and cancellation");

      await stop();
      await start();
      await send(
        "Without tools, what proof file did you create earlier and what did it contain? Answer briefly.",
      );
      session = await finished();
      assert.equal(session.nativeSessionId, nativeSessionId);
      assert.match(session.messages.at(-1)!.text, /native-tool-proof/);
      assert.match(session.messages.at(-1)!.text, /native-tool-ok/);
      assert.ok(
        session.messages.some(
          (message) =>
            message.role === "assistant" &&
            message.tools.some((tool) => tool.status === "complete"),
        ),
      );
      console.log("PASS cold native resumption with history direct from Muse");
      const bytes = readFileSync(
        new URL("./fixtures/green.png", import.meta.url),
      );
      await send(
        "What is the dominant color in this image? Answer with one color word. Do not use tools.",
        "promptUnmatched",
        [
          {
            id: crypto.randomUUID(),
            name: "green.png",
            mimeType: "image/png",
            size: bytes.length,
            kind: "image",
            dataUrl: `data:image/png;base64,${bytes.toString("base64")}`,
            text: "",
          },
        ],
      );
      session = await finished();
      assert.match(session.messages.at(-1)!.text, /green/i);
      console.log("PASS real native image input");
      const imageUrl = session.messages.at(-2)!.attachments[0].dataUrl;
      assert.ok(imageUrl.startsWith("/api/chat/sessions/"));
      const imageResponse = await request(imageUrl.replace(/^\/api\//, ""));
      assert.equal(imageResponse.status, 200);
      assert.deepEqual(Buffer.from(await imageResponse.arrayBuffer()), bytes);
      await stop();
      await start();
      const reloaded = await current();
      assert.match(reloaded.messages.at(-1)!.text, /green/i);
      const reloadedUrl = reloaded.messages.at(-2)!.attachments[0].dataUrl;
      assert.ok(reloadedUrl.startsWith("/api/chat/sessions/"));
      const reloadedImage = await request(reloadedUrl.replace(/^\/api\//, ""));
      assert.equal(reloadedImage.status, 200);
      assert.deepEqual(Buffer.from(await reloadedImage.arrayBuffer()), bytes);
      console.log("PASS staged attachments survive backend restart");

      const text =
        "The document verification phrase is native-document-confirmed.";
      await send(
        "What verification phrase is in the attached document? Do not use tools.",
        "promptUnmatched",
        [
          {
            id: crypto.randomUUID(),
            name: "verification.txt",
            mimeType: "text/plain",
            size: Buffer.byteLength(text),
            kind: "text",
            dataUrl: `data:text/plain;base64,${Buffer.from(text).toString("base64")}`,
            text: "",
          },
        ],
      );
      session = await finished();
      assert.match(session.messages.at(-1)!.text, /native-document-confirmed/);
      console.log("PASS document text fallback");
    } finally {
      await stop();
      rmSync(folder, { recursive: true, force: true });
    }
  },
);
