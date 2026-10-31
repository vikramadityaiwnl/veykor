import { test } from "node:test";
import assert from "node:assert/strict";
import { getCpu, getMemory, parseDfOutput, parseMeminfo, parseVmStat } from "../src/status/host-stats.js";

test("df output parses 1K blocks into bytes", () => {
  const usage = parseDfOutput(
    "Filesystem 1024-blocks Used Available Capacity Mounted on\n/dev/disk3s5 971350180 566926808 375567404 61% /System/Volumes/Data\n",
  );

  assert.equal(usage.totalBytes, 971350180 * 1024);
  assert.equal(usage.usedBytes, 566926808 * 1024);
  assert.equal(usage.freeBytes, 375567404 * 1024);
});

test("df output falls back to zeros when unparseable", () => {
  assert.deepEqual(parseDfOutput(""), {
    totalBytes: 0,
    usedBytes: 0,
    freeBytes: 0,
  });
  assert.deepEqual(parseDfOutput("Filesystem 1024-blocks\n"), {
    totalBytes: 0,
    usedBytes: 0,
    freeBytes: 0,
  });
});

test("vm_stat counts free, inactive, and speculative pages as available", () => {
  const available = parseVmStat(
    "Mach Virtual Memory Statistics: (page size of 16384 bytes)\nPages free: 76678.\nPages active: 335078.\nPages inactive: 332201.\nPages speculative: 4239.\nPages wired down: 121641.\n",
  );

  assert.equal(available, (76678 + 332201 + 4239) * 16384);
});

test("vm_stat falls back to zero when unparseable", () => {
  assert.equal(parseVmStat(""), 0);
  assert.equal(
    parseVmStat("Mach Virtual Memory Statistics:\nPages free: 10.\n"),
    0,
  );
});

test("meminfo parses MemAvailable into bytes", () => {
  const available = parseMeminfo(
    "MemTotal:       16384000 kB\nMemFree:         2048000 kB\nMemAvailable:    8192000 kB\n",
  );

  assert.equal(available, 8192000 * 1024);
});

test("meminfo falls back to zero when unavailable", () => {
  assert.equal(parseMeminfo(""), 0);
  assert.equal(parseMeminfo("MemTotal: 16384000 kB\n"), 0);
});

test("host stats return a complete default shape", async () => {
  const cpu = getCpu();
  const memory = await getMemory();

  assert.ok(cpu.cores > 0);
  assert.ok(cpu.usagePercent >= 0 && cpu.usagePercent <= 100);
  assert.equal(cpu.loadAverage.length, 3);
  assert.ok(memory.totalBytes > 0);
  assert.equal(memory.usedBytes + memory.freeBytes, memory.totalBytes);
  assert.ok(memory.usagePercent >= 0 && memory.usagePercent <= 100);
});
