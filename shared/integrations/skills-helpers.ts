import type {
  CreateSkillRequest,
  SkillDetail,
  SkillListResponse,
  SkillSummary,
  UpdateSkillRequest,
} from "./skills-contracts.js";

export const skillPaths = {
  skills: "/api/integrations/skills",
  skill: (id: string) => `/api/integrations/skills/${id}`,
  chatSkills: (chatId: string) => `/api/integrations/skills/chat/${chatId}`,
} as const;

const maxSlugLength = 64;

const maxNameLength = 100;

const maxDescriptionLength = 500;

const maxInstructionsLength = 50000;

const slugPattern = /^[a-z0-9_-]+$/;

const reservedStems = new Set([
  "con",
  "prn",
  "aux",
  "nul",
  "com1",
  "com2",
  "com3",
  "com4",
  "com5",
  "com6",
  "com7",
  "com8",
  "com9",
  "lpt1",
  "lpt2",
  "lpt3",
  "lpt4",
  "lpt5",
  "lpt6",
  "lpt7",
  "lpt8",
  "lpt9",
]);

function singleLine(value: string): boolean {
  return !value.includes("\n") && !value.includes("\r");
}

export function skillSlugError(value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    return "Give the skill an id.";
  }

  const slug = value.trim();

  if (slug.length > maxSlugLength) {
    return "Keep the id under 64 characters.";
  }

  if (slug.startsWith("-") || slug.startsWith(".") || !slugPattern.test(slug)) {
    return "Use lowercase letters, numbers, dashes, and underscores for the id.";
  }

  if (reservedStems.has(slug)) {
    return "That id is reserved. Pick another one.";
  }

  return "";
}

export function filterSkillName(value: string): string {
  return value.replace(/[^a-z0-9_-]/g, "").replace(/^-+/, "");
}

export function deriveSkillSlug(name: unknown): string | null {
  if (typeof name !== "string") {
    return null;
  }

  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, maxSlugLength)
    .replace(/^-+|-+$/g, "");

  if (slug === "" || skillSlugError(slug) !== "") {
    return null;
  }

  return slug;
}

export function emptySkillList(): SkillListResponse {
  return { skills: [] };
}

export function defaultSkillSummary(): SkillSummary {
  return {
    id: "",
    slug: "",
    name: "",
    description: "",
    enabled: true,
    createdAt: "",
    updatedAt: "",
  };
}

export function defaultSkillDetail(): SkillDetail {
  return { ...defaultSkillSummary(), instructions: "" };
}

export function skillValidationError(
  input: CreateSkillRequest | UpdateSkillRequest,
  options: { partial: boolean },
): string {
  if (input.name !== undefined || !options.partial) {
    const name = typeof input.name === "string" ? input.name.trim() : "";

    if (name === "") {
      return "Give the skill a name.";
    }

    if (name.length > maxNameLength) {
      return "Keep the name under 100 characters.";
    }

    if (!singleLine(name)) {
      return "Keep the name on one line.";
    }
  }

  if (input.description !== undefined || !options.partial) {
    const description =
      typeof input.description === "string" ? input.description.trim() : "";

    if (description === "") {
      return "Describe what the skill does.";
    }

    if (description.length > maxDescriptionLength) {
      return "Keep the description under 500 characters.";
    }

    if (!singleLine(description)) {
      return "Keep the description on one line.";
    }
  }

  if (input.instructions !== undefined || !options.partial) {
    const instructions =
      typeof input.instructions === "string" ? input.instructions.trim() : "";

    if (instructions === "") {
      return "Write the skill instructions.";
    }

    if (instructions.length > maxInstructionsLength) {
      return "Keep the instructions under 50,000 characters.";
    }
  }

  if (input.enabled !== undefined && typeof input.enabled !== "boolean") {
    return "Choose whether the skill is enabled.";
  }

  return "";
}
