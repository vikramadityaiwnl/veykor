import assert from "node:assert/strict";
import { test } from "node:test";
import {
  deriveSkillSlug,
  emptySkillList,
  filterSkillName,
  skillSlugError,
  skillValidationError,
} from "@veykor/shared";

test("skill validation accepts complete configurations", () => {
  assert.equal(
    skillValidationError(
      {
        name: "My Skill",
        description: "Does something useful.",
        instructions: "Follow these steps.",
        enabled: true,
      },
      { partial: false },
    ),
    "",
  );
});

test("skill names filter to the id convention", () => {
  assert.equal(filterSkillName("my-skill_2"), "my-skill_2");
  assert.equal(filterSkillName("Roll And Dice"), "ollndice");
  assert.equal(filterSkillName("--lead"), "lead");
  assert.equal(filterSkillName("trail--"), "trail--");
  assert.equal(filterSkillName("a b!c"), "abc");
});

test("skill ids derive from display names", () => {
  assert.equal(deriveSkillSlug("Roll And Dice"), "roll-and-dice");
  assert.equal(deriveSkillSlug("  Spaced Out  "), "spaced-out");
  assert.equal(deriveSkillSlug("under_score"), "under-score");
  assert.equal(deriveSkillSlug("Version 2!"), "version-2");
  assert.equal(deriveSkillSlug("!!!"), null);
  assert.equal(deriveSkillSlug("con"), null);
  assert.equal(deriveSkillSlug(""), null);
  assert.equal(deriveSkillSlug(undefined), null);
});

test("skill validation rejects bad ids", () => {
  assert.equal(skillSlugError("my-skill_2"), "");
  assert.notEqual(skillSlugError(""), "");
  assert.notEqual(skillSlugError("  "), "");
  assert.notEqual(skillSlugError("UPPER"), "");
  assert.notEqual(skillSlugError("-lead"), "");
  assert.notEqual(skillSlugError("has space"), "");
  assert.notEqual(skillSlugError("has/slash"), "");
  assert.notEqual(skillSlugError("dot.name"), "");
  assert.notEqual(skillSlugError("con"), "");
  assert.notEqual(skillSlugError("aux"), "");
  assert.notEqual(skillSlugError("x".repeat(65)), "");
});

test("skill validation rejects missing or malformed fields", () => {
  const valid = {
    name: "My Skill",
    description: "Does something useful.",
    instructions: "Follow these steps.",
  };

  assert.notEqual(
    skillValidationError({ ...valid, name: "  " }, { partial: false }),
    "",
  );

  assert.notEqual(
    skillValidationError({ ...valid, description: "" }, { partial: false }),
    "",
  );

  assert.notEqual(
    skillValidationError(
      { ...valid, description: "one\ntwo" },
      { partial: false },
    ),
    "",
  );

  assert.notEqual(
    skillValidationError({ ...valid, instructions: "" }, { partial: false }),
    "",
  );

  assert.notEqual(
    skillValidationError(
      { ...valid, enabled: "yes" as never },
      { partial: false },
    ),
    "",
  );
});

test("skill partial validation only checks supplied fields", () => {
  assert.equal(skillValidationError({ enabled: false }, { partial: true }), "");
  assert.equal(
    skillValidationError({ name: "Renamed" }, { partial: true }),
    "",
  );

  assert.notEqual(skillValidationError({ name: "" }, { partial: true }), "");

  assert.notEqual(
    skillValidationError({ description: "one\ntwo" }, { partial: true }),
    "",
  );
});

test("empty skill lists carry complete default shapes", () => {
  assert.deepEqual(emptySkillList(), { skills: [] });
});
