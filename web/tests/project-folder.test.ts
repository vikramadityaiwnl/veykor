import assert from "node:assert/strict";
import { test } from "node:test";
import type { WorkProject } from "@veykor/shared";
import { isFolderMissing } from "../src/work/project-folder.ts";

function project(folderExists: boolean | undefined): WorkProject {
  return {
    id: "project",
    name: "Project",
    folder: "/tmp/project",
    sectionId: "recent",
    agentIds: [],
    branch: "No branch",
    folderExists: folderExists as boolean,
  };
}

test("folder lock needs an explicit missing signal", () => {
  assert.equal(isFolderMissing("", true, undefined), false);
  assert.equal(isFolderMissing("project", false, undefined), false);
  assert.equal(isFolderMissing("project", true, undefined), false);
  assert.equal(isFolderMissing("project", true, project(true)), false);
  assert.equal(isFolderMissing("project", true, project(undefined)), false);
  assert.equal(isFolderMissing("project", true, project(false)), true);
});
