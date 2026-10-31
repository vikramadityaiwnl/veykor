import type { ChatSession } from "@veykor/shared";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { stream } from "hono/streaming";
import { requireAuth, type AuthEnv } from "../auth/auth.js";
import { getSettings } from "../settings/settings.js";
import { runChat, validChatRequest } from "../chat/chat-runner.js";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { chatHistories } from "../db/schema.js";
import { validChatSessions, normalizeChatSessions } from "../chat/chat-history.js";

const running = new Set<number>();

export const chatRoute = new Hono<AuthEnv>();

chatRoute.use("*", requireAuth);
chatRoute.use("*", bodyLimit({ maxSize: 1_000_000 }));

chatRoute.get("/sessions", (c) => {
  const history = db
    .select()
    .from(chatHistories)
    .where(eq(chatHistories.userId, c.get("user").id))
    .get();

  const sessions: ChatSession[] = history ? JSON.parse(history.sessions) : [];

  return c.json({
    sessions: normalizeChatSessions(sessions).filter(
      (session) => session.messages.length > 0,
    ),
  });
});

chatRoute.put("/sessions", async (c) => {
  let input: unknown;
  try {
    input = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }

  if (!validChatSessions(input)) {
    return c.json({ error: "Invalid conversation history" }, 400);
  }

  const sessions = normalizeChatSessions(input.sessions);

  db.insert(chatHistories)
    .values({
      userId: c.get("user").id,
      sessions: JSON.stringify(sessions),
    })
    .onConflictDoUpdate({
      target: chatHistories.userId,
      set: { sessions: JSON.stringify(sessions) },
    })
    .run();

  return c.json({ sessions });
});

chatRoute.post("/", async (c) => {
  let input: unknown;
  try {
    input = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }

  if (!validChatRequest(input)) {
    return c.json(
      {
        error:
          "Choose a supported provider, model, and a nonempty message (up to 200 messages).",
      },
      400,
    );
  }

  const userId = c.get("user").id;
  if (running.has(userId)) {
    return c.json(
      {
        error:
          "A reply is already in progress. Stop it before sending another message.",
      },
      409,
    );
  }

  const catalog = await getSettings();
  const provider = catalog.providers.find(
    (entry) => entry.id === input.providerId,
  );
  if (!provider?.available) {
    return c.json({ error: provider?.error || "Provider is unavailable" }, 503);
  }

  if (running.has(userId)) {
    return c.json({ error: "A reply is already in progress" }, 409);
  }
  running.add(userId);
  c.header("Content-Type", "application/x-ndjson");
  c.header("X-Accel-Buffering", "no");

  return stream(c, async (output) => {
    const controller = new AbortController();
    output.onAbort(() => controller.abort());
    let writes = Promise.resolve();

    try {
      await runChat(input, controller.signal, (event) => {
        writes = writes
          .then(async () => {
            if (!controller.signal.aborted) {
              await output.write(JSON.stringify(event) + "\n");
            }
          })
          .catch(() => {
            controller.abort();
          });
      });
      await writes;
    } catch (error) {
      if (!controller.signal.aborted) {
        await output.write(
          JSON.stringify({
            type: "error",
            message:
              error instanceof Error
                ? error.message
                : "Unable to generate a reply",
          }) + "\n",
        );
      }
    } finally {
      running.delete(userId);
    }
  });
});
