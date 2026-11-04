import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import type { ChatPullRequest } from "@veykor/shared";
import { db } from "../db/client.js";
import { pullRequests } from "../db/schema.js";
import { ghPrResolve, ghPrView, parsePrUrl } from "./git.js";

function nowIso(): string {
  return new Date().toISOString();
}

export function resolveAndRecordPullRequest(input: {
  userId: number;
  chatId: string;
  folder: string;
  url: unknown;
  number: unknown;
}): ChatPullRequest {
  const url =
    typeof input.url === "string" ? input.url.trim().slice(0, 500) : "";

  let number = 0;

  if (typeof input.number === "number") {
    number = input.number;
  } else if (typeof input.number === "string" && /^\d+$/.test(input.number)) {
    number = Number.parseInt(input.number, 10);
  }

  if (url !== "") {
    const parsed = parsePrUrl(url);

    if (parsed === null) {
      throw new Error("That pull request url is invalid.");
    }

    const detail = ghPrView(parsed.repo, parsed.number);

    return recordPullRequestLink({
      userId: input.userId,
      chatId: input.chatId,
      repo: parsed.repo,
      number: parsed.number,
      url: detail.url === "" ? url : detail.url,
      merged: detail.merged,
    });
  }

  if (Number.isInteger(number) && number > 0) {
    if (input.folder === "") {
      throw new Error(
        "Pass the full pull request url when this chat has no project folder.",
      );
    }

    const resolved = ghPrResolve(input.folder, number);

    return recordPullRequestLink({
      userId: input.userId,
      chatId: input.chatId,
      ...resolved,
    });
  }

  throw new Error("Pass the pull request url or number.");
}

export function recordPullRequestLink(input: {
  userId: number;
  chatId: string;
  repo: string;
  number: number;
  url: string;
  merged: boolean;
}): ChatPullRequest {
  const stamp = nowIso();

  const existing = db
    .select()
    .from(pullRequests)
    .where(
      and(
        eq(pullRequests.userId, input.userId),
        eq(pullRequests.chatId, input.chatId),
        eq(pullRequests.number, input.number),
      ),
    )
    .get();

  if (existing) {
    db.update(pullRequests)
      .set({
        repo: input.repo,
        url: input.url,
        merged: input.merged ? 1 : 0,
        updatedAt: stamp,
      })
      .where(eq(pullRequests.id, existing.id))
      .run();
  } else {
    db.insert(pullRequests)
      .values({
        id: randomUUID(),
        userId: input.userId,
        chatId: input.chatId,
        repo: input.repo,
        number: input.number,
        url: input.url,
        merged: input.merged ? 1 : 0,
        createdAt: stamp,
        updatedAt: stamp,
      })
      .run();
  }

  return { number: input.number, url: input.url, merged: input.merged };
}

export function readPullRequestLink(
  userId: number,
  chatId: string,
  number: number,
): { repo: string; number: number; url: string; merged: boolean } | undefined {
  const row = db
    .select()
    .from(pullRequests)
    .where(
      and(
        eq(pullRequests.userId, userId),
        eq(pullRequests.chatId, chatId),
        eq(pullRequests.number, number),
      ),
    )
    .get();

  if (!row) {
    return undefined;
  }

  return {
    repo: row.repo,
    number: row.number,
    url: row.url,
    merged: row.merged === 1,
  };
}

export function listPullRequestLinks(
  userId: number,
  chatId: string,
): Array<ChatPullRequest> {
  return db
    .select()
    .from(pullRequests)
    .where(
      and(eq(pullRequests.userId, userId), eq(pullRequests.chatId, chatId)),
    )
    .all()
    .map((row) => ({
      number: row.number,
      url: row.url,
      merged: row.merged === 1,
    }));
}

export function pullRequestsForChats(
  userId: number,
  chatIds: Array<string>,
): Map<string, Array<ChatPullRequest>> {
  const grouped = new Map<string, Array<ChatPullRequest>>();

  if (chatIds.length === 0) {
    return grouped;
  }

  const rows = db
    .select()
    .from(pullRequests)
    .where(
      and(
        eq(pullRequests.userId, userId),
        inArray(pullRequests.chatId, chatIds),
      ),
    )
    .all();

  for (const row of rows) {
    const entries = grouped.get(row.chatId) ?? [];

    entries.push({
      number: row.number,
      url: row.url,
      merged: row.merged === 1,
    });
    grouped.set(row.chatId, entries);
  }

  return grouped;
}

export function refreshPullRequestMerged(
  userId: number,
  chatId: string,
  number: number,
  merged: boolean,
): void {
  db.update(pullRequests)
    .set({ merged: merged ? 1 : 0, updatedAt: nowIso() })
    .where(
      and(
        eq(pullRequests.userId, userId),
        eq(pullRequests.chatId, chatId),
        eq(pullRequests.number, number),
      ),
    )
    .run();
}
