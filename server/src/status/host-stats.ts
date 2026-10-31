import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { cpus, freemem, loadavg, platform, totalmem } from "node:os";
import type { StatusCpu, StatusMemory, StatusStorage } from "@veykor/shared";

interface CpuSample {
  idle: number;
  total: number;
}

interface DiskUsage {
  totalBytes: number;
  usedBytes: number;
  freeBytes: number;
}

let previousCpu = sampleCpu();

function sampleCpu(): CpuSample {
  let idle = 0;
  let total = 0;

  for (const cpu of cpus()) {
    idle += cpu.times.idle;
    total +=
      cpu.times.user +
      cpu.times.nice +
      cpu.times.sys +
      cpu.times.idle +
      cpu.times.irq;
  }

  return { idle, total };
}

export function parseDfOutput(output: string): DiskUsage {
  const empty: DiskUsage = { totalBytes: 0, usedBytes: 0, freeBytes: 0 };
  const line = output.trim().split("\n")[1];

  if (!line) {
    return empty;
  }

  const fields = line.trim().split(/\s+/);

  if (fields.length < 4) {
    return empty;
  }

  const blocks = Number(fields[1]);
  const used = Number(fields[2]);
  const free = Number(fields[3]);

  if (
    !Number.isFinite(blocks) ||
    !Number.isFinite(used) ||
    !Number.isFinite(free)
  ) {
    return empty;
  }

  return {
    totalBytes: blocks * 1024,
    usedBytes: used * 1024,
    freeBytes: free * 1024,
  };
}

export function parseVmStat(output: string): number {
  const pageSize = Number(output.match(/page size of (\d+) bytes/)?.[1] ?? 0);

  if (!pageSize) {
    return 0;
  }

  const pages = (name: string): number =>
    Number(output.match(new RegExp(`${name}:\\s+(\\d+)`))?.[1] ?? 0);

  return (
    (pages("Pages free") +
      pages("Pages inactive") +
      pages("Pages speculative")) *
    pageSize
  );
}

export function parseMeminfo(output: string): number {
  const kilobytes = Number(
    output.match(/^MemAvailable:\s+(\d+)\s+kB/m)?.[1] ?? 0,
  );

  return kilobytes * 1024;
}

function runCommand(file: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(file, args, { timeout: 5000 }, (error, stdout) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(stdout);
    });
  });
}

export function getCpu(): StatusCpu {
  const current = sampleCpu();
  const idleDelta = current.idle - previousCpu.idle;
  const totalDelta = current.total - previousCpu.total;
  previousCpu = current;

  const usage =
    totalDelta > 0 ? Math.max(0, Math.min(1, 1 - idleDelta / totalDelta)) : 0;

  return {
    usagePercent: Math.round(usage * 1000) / 10,
    cores: cpus().length,
    model: (cpus()[0]?.model ?? "").trim(),
    loadAverage: loadavg().map((value) => Math.round(value * 100) / 100),
  };
}

export async function getMemory(): Promise<StatusMemory> {
  const total = totalmem();
  let available = freemem();

  try {
    if (platform() === "darwin") {
      const parsed = parseVmStat(await runCommand("vm_stat", []));

      if (parsed > 0) {
        available = parsed;
      }
    } else if (platform() === "linux") {
      const parsed = parseMeminfo(await readFile("/proc/meminfo", "utf8"));

      if (parsed > 0) {
        available = parsed;
      }
    }
  } catch {
    available = freemem();
  }

  const free = Math.max(0, Math.min(total, available));
  const used = total - free;

  return {
    totalBytes: total,
    usedBytes: used,
    freeBytes: free,
    usagePercent: total > 0 ? Math.round((used / total) * 1000) / 10 : 0,
  };
}

export async function getStorage(path: string): Promise<StatusStorage> {
  let usage: DiskUsage = { totalBytes: 0, usedBytes: 0, freeBytes: 0 };

  try {
    usage = parseDfOutput(await runCommand("df", ["-k", "-P", path]));
  } catch {
    usage = { totalBytes: 0, usedBytes: 0, freeBytes: 0 };
  }

  return {
    path,
    totalBytes: usage.totalBytes,
    usedBytes: usage.usedBytes,
    freeBytes: usage.freeBytes,
    usagePercent:
      usage.totalBytes > 0
        ? Math.round((usage.usedBytes / usage.totalBytes) * 1000) / 10
        : 0,
  };
}
