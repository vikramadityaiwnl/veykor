import { sql } from "drizzle-orm";
import { statSync } from "node:fs";
import { dirname } from "node:path";
import type { StatusDatabase, SystemStatusResponse } from "@veykor/shared";
import { db, dbPath } from "../db/client.js";
import { getCpu, getMemory, getStorage } from "./host-stats.js";

function getDatabaseSize(): number {
  let size = 0;

  for (const path of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
    try {
      size += statSync(path).size;
    } catch {
      continue;
    }
  }

  return size;
}

function getDatabase(): StatusDatabase {
  const started = performance.now();

  try {
    db.run(sql`SELECT 1`);
  } catch {
    return {
      status: "disconnected",
      latencyMs: 0,
      sizeBytes: getDatabaseSize(),
    };
  }

  return {
    status: "connected",
    latencyMs: Math.round((performance.now() - started) * 10) / 10,
    sizeBytes: getDatabaseSize(),
  };
}

export async function getSystemStatus(): Promise<SystemStatusResponse> {
  return {
    database: getDatabase(),
    cpu: getCpu(),
    memory: await getMemory(),
    storage: await getStorage(dirname(dbPath)),
  };
}
