import assert from "node:assert/strict";
import { test } from "node:test";
import { workGreetingFor } from "../src/work/work-greeting-titles.ts";
import { greetingTitlesFor } from "../src/chat/greeting-titles.ts";

test("work and project greetings follow local time boundaries and differ from chat", () => {
  for (const [hour, expected] of [
    [0, "quiet night"],
    [4, "quiet night"],
    [5, "Good morning"],
    [11, "Good morning"],
    [12, "Good afternoon"],
    [16, "Good afternoon"],
    [17, "Good evening"],
    [21, "Good evening"],
    [22, "quiet night"],
    [23, "quiet night"],
  ] as const) {
    const now = new Date(2026, 10, 4, hour);
    const work = workGreetingFor(now);
    const project = workGreetingFor(now, "Example project");

    assert.ok(work.includes(expected));
    assert.ok(project.includes(expected));
    assert.ok(project.includes("Example project"));
    assert.notEqual(work, project);
    assert.ok(!greetingTitlesFor(now).includes(work));
    assert.ok(!greetingTitlesFor(now).includes(project));
  }
});
