import { cpSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import type { CreateSkillInput, SkillDetail, UpdateSkillInput } from "@veykor/shared";
import { scanDetectedSkills } from "./detect.js";

export interface SkillLocation {
  sourceId: string;
  dirName: string;
  folderPath: string;
  filePath: string;
}

function skillId(sourceId: string, dirName: string): string {
  return `${sourceId}/${dirName}`;
}

export function resolveSkillLocation(
  home: string,
  id: string,
): SkillLocation | null {
  const separator = id.indexOf("/");

  if (separator <= 0 || separator === id.length - 1) {
    return null;
  }

  const sourceId = id.slice(0, separator);
  const dirName = id.slice(separator + 1);

  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(dirName)) {
    return null;
  }

  const source = scanDetectedSkills(home).find(
    (entry) => entry.id === sourceId,
  );

  if (!source) {
    return null;
  }

  const folderPath = join(source.path, dirName);
  const skill = source.skills.find((entry) => entry.path === folderPath);

  if (!skill) {
    return null;
  }

  return {
    sourceId,
    dirName,
    folderPath,
    filePath: join(folderPath, "SKILL.md"),
  };
}

function splitSkillFile(text: string): { head: string[]; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)([\s\S]*)$/.exec(text);

  if (!match) {
    return { head: [], body: text };
  }

  return { head: match[1].split("\n"), body: match[3] };
}

function frontmatterValue(head: string[], field: string): string {
  const line = head
    .map((entry) => entry.trim())
    .find((entry) => entry.toLowerCase().startsWith(`${field}:`));

  if (!line) {
    return "";
  }

  return line
    .slice(field.length + 1)
    .trim()
    .replace(/^["']|["']$/g, "")
    .trim();
}

function buildSkillFile(head: string[], body: string): string {
  return `---\n${head.join("\n")}\n---\n${body}`;
}

export function readSkillDetail(home: string, id: string): SkillDetail | null {
  const location = resolveSkillLocation(home, id);

  if (!location) {
    return null;
  }

  let text = "";

  try {
    text = readFileSync(location.filePath, "utf8");
  } catch {
    return null;
  }

  const { head, body } = splitSkillFile(text);

  return {
    id,
    name: frontmatterValue(head, "name") || location.dirName,
    description: frontmatterValue(head, "description"),
    body,
    file: text,
    path: location.folderPath,
  };
}

export function validSkillName(name: unknown): name is string {
  return typeof name === "string" && /^[a-z0-9][a-z0-9-]{0,63}$/.test(name);
}

export function validSkillInput(input: unknown): input is {
  description: string;
  body: string;
} {
  if (!input || typeof input !== "object") {
    return false;
  }

  const candidate = input as Record<string, unknown>;

  return (
    typeof candidate.description === "string" &&
    candidate.description.trim().length > 0 &&
    candidate.description.length <= 500 &&
    typeof candidate.body === "string" &&
    candidate.body.trim().length > 0 &&
    candidate.body.length <= 200000
  );
}

export function createSkill(
  home: string,
  input: CreateSkillInput,
): SkillDetail | null {
  if (!validSkillName(input.name) || !validSkillInput(input)) {
    return null;
  }

  const folderPath = join(home, ".agents", "skills", input.name);

  if (existsSync(folderPath)) {
    return null;
  }

  const head = [
    `name: ${input.name}`,
    `description: ${input.description.trim()}`,
  ];

  try {
    mkdirSync(folderPath, { recursive: true });
    writeFileSync(
      join(folderPath, "SKILL.md"),
      buildSkillFile(head, input.body),
    );
  } catch {
    return null;
  }

  return readSkillDetail(home, skillId("agents-skills", input.name));
}

export function updateSkill(
  home: string,
  id: string,
  input: UpdateSkillInput,
): SkillDetail | null {
  if (!validSkillName(input.name) || !validSkillInput(input)) {
    return null;
  }

  let location = resolveSkillLocation(home, id);

  if (!location) {
    return null;
  }

  let text = "";

  try {
    text = readFileSync(location.filePath, "utf8");
  } catch {
    return null;
  }

  const backup = `${location.filePath}.bak`;

  try {
    if (!existsSync(backup)) {
      writeFileSync(backup, text);
    }
  } catch {
    return null;
  }

  if (input.name !== location.dirName) {
    const folderPath = join(dirname(location.folderPath), input.name);

    if (existsSync(folderPath)) {
      return null;
    }

    try {
      renameSync(location.folderPath, folderPath);
    } catch {
      return null;
    }

    location = {
      ...location,
      dirName: input.name,
      folderPath,
      filePath: join(folderPath, "SKILL.md"),
    };
  }

  const { head } = splitSkillFile(text);
  const kept = head.filter((entry) => {
    const key = entry.trim().toLowerCase();

    return !key.startsWith("name:") && !key.startsWith("description:");
  });

  kept.unshift(`description: ${input.description.trim()}`);
  kept.unshift(`name: ${input.name}`);

  try {
    writeFileSync(location.filePath, buildSkillFile(kept, input.body));
  } catch {
    return null;
  }

  return readSkillDetail(home, skillId(location.sourceId, location.dirName));
}

export function deleteSkill(home: string, id: string): boolean {
  const location = resolveSkillLocation(home, id);

  if (!location) {
    return false;
  }

  const backup = `${location.folderPath}.bak`;

  try {
    if (!existsSync(backup)) {
      cpSync(location.folderPath, backup, { recursive: true });
    }

    rmSync(location.folderPath, { recursive: true, force: true });
  } catch {
    return false;
  }

  return true;
}

export function skillDirName(skillPath: string): string {
  return basename(skillPath);
}
