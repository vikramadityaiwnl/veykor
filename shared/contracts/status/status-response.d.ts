export interface StatusDatabase {
  status: "connected" | "disconnected";
  latencyMs: number;
  sizeBytes: number;
}

export interface StatusCpu {
  usagePercent: number;
  cores: number;
  model: string;
  loadAverage: number[];
}

export interface StatusMemory {
  totalBytes: number;
  usedBytes: number;
  freeBytes: number;
  usagePercent: number;
}

export interface StatusStorage {
  path: string;
  totalBytes: number;
  usedBytes: number;
  freeBytes: number;
  usagePercent: number;
}

export interface SystemStatusResponse {
  database: StatusDatabase;
  cpu: StatusCpu;
  memory: StatusMemory;
  storage: StatusStorage;
}
