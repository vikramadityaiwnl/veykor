import assert from "node:assert/strict";
import { test } from "node:test";
import {
  teamRoutingRules,
  teammateRosterSection,
} from "../../src/teams/team-context.ts";

test("teammate roster lists specialties for delegation", () => {
  assert.equal(teammateRosterSection([]), "");

  const section = teammateRosterSection([
    {
      agentId: "agent-github",
      name: "GitHub Manager",
      description: "Agent to manage GitHub commits, issues and PR.",
      hasSession: false,
    },
    {
      agentId: "agent-review",
      name: "Reviewer",
      description: "",
      hasSession: true,
    },
  ]);

  assert.match(
    section,
    /GitHub Manager \(agentId agent-github, no session yet\)/,
  );
  assert.match(section, /commits, issues and PR\./);
  assert.match(
    section,
    /Reviewer \(agentId agent-review, session active\): No description\./,
  );
});

test("teammate roster bounds long descriptions", () => {
  const section = teammateRosterSection([
    {
      agentId: "agent-long",
      name: "Verbose",
      description: `  ${"x".repeat(500)}  `,
      hasSession: false,
    },
  ]);

  assert.equal(section.includes("x".repeat(301)), false);
  assert.equal(section.includes("x".repeat(300)), true);
});

test("routing rules send specialty work to teammates", () => {
  assert.match(teamRoutingRules, /Delegate by specialty/);
  assert.match(teamRoutingRules, /without being asked/);
  assert.match(teamRoutingRules, /version-control work/);
  assert.match(teamRoutingRules, /Never perform a teammate's specialty/);
  assert.match(teamRoutingRules, /both directions/);
  assert.match(teamRoutingRules, /Hold your lane strictly/);
  assert.match(teamRoutingRules, /team_delegate/);
});
