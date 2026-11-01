import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface DetectedSkillScan {
  name: string;
  description: string;
  path: string;
}

export interface DetectedSkillSourceScan {
  id: string;
  label: string;
  path: string;
  skills: DetectedSkillScan[];
}

const folders: Array<{ id: string; label: string; relative: string }> = [
  {
    id: "agents-skills",
    label: "Agent skills",
    relative: join(".agents", "skills"),
  },
  {
    id: "claude-skills",
    label: "Claude skills",
    relative: join(".claude", "skills"),
  },
];

function frontmatterField(text: string, field: string): string {
  const match =
    /^---\r?\n([\s\S]*?)\r?\n---/.exec(text) ||
    /^---\r?\n([\s\S]*)$/.exec(text);

  if (!match) {
    return "";
  }

  const line = match[1]
    .split("\n")
    .map((entry) => entry.trim())
    .find((entry) => entry.toLowerCase().startsWith(`${field}:`));

  if (!line) {
    return "";
  }

  return line
    .slice(field.length + 1)
    .trim()
    .replace(/^["']|["']$/g, "")
    .trim()
    .slice(0, 300);
}

function skillFile(folder: string): string | null {
  let names: string[];

  try {
    names = readdirSync(folder);
  } catch {
    return null;
  }

  const match = names.find((name) => name.toLowerCase() === "skill.md");

  return match ? join(folder, match) : null;
}

export function scanDetectedSkills(
  home: string = homedir(),
): DetectedSkillSourceScan[] {
  const sources: DetectedSkillSourceScan[] = [];

  for (const folder of folders) {
    const path = join(home, folder.relative);

    let names: string[];

    try {
      names = readdirSync(path);
    } catch {
      continue;
    }

    const skills: DetectedSkillScan[] = [];

    for (const name of names.sort()) {
      const folderPath = join(path, name);

      try {
        if (!statSync(folderPath).isDirectory()) {
          continue;
        }
      } catch {
        continue;
      }

      const file = skillFile(folderPath);

      if (!file || !existsSync(file)) {
        continue;
      }

      let text = "";

      try {
        text = readFileSync(file, "utf8");
      } catch {
        continue;
      }

      skills.push({
        name: frontmatterField(text, "name") || name,
        description: frontmatterField(text, "description"),
        path: folderPath,
      });
    }

    if (skills.length > 0) {
      sources.push({ id: folder.id, label: folder.label, path, skills });
    }
  }

  return sources;
}
