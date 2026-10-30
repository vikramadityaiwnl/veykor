import { sql } from "drizzle-orm";
import { Hono } from "hono";
import type { VisitsResponse } from "@veykor/shared";
import { db } from "../db/client.js";
import { visits } from "../db/schema.js";

const ROW_ID = 1;

function readCount(): number {
  const row = db
    .select({ count: visits.count })
    .from(visits)
    .where(sql`${visits.id} = ${ROW_ID}`)
    .get();

  return row?.count ?? 0;
}

function incrementCount(): number {
  return db.transaction((tx) => {
    tx.insert(visits)
      .values({ id: ROW_ID, count: 0, updatedAt: new Date() })
      .onConflictDoNothing()
      .run();

    tx.update(visits)
      .set({ count: sql`${visits.count} + 1`, updatedAt: new Date() })
      .where(sql`${visits.id} = ${ROW_ID}`)
      .run();

    return (
      tx
        .select({ count: visits.count })
        .from(visits)
        .where(sql`${visits.id} = ${ROW_ID}`)
        .get()?.count ?? 0
    );
  });
}

function createResponse(count: number): VisitsResponse {
  return { count };
}

export const visitsRoute = new Hono()
  .get("/", (c) => c.json(createResponse(readCount())))
  .post("/", (c) => c.json(createResponse(incrementCount()), 201));
