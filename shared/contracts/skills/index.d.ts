export interface DetectedSkill {
  id: string;
  name: string;
  description: string;
  path: string;
}

export interface SkillDetail {
  id: string;
  name: string;
  description: string;
  body: string;
  file: string;
  path: string;
}

export interface CreateSkillInput {
  name: string;
  description: string;
  body: string;
}

export interface UpdateSkillInput {
  name: string;
  description: string;
  body: string;
}

export interface DetectedSkillSource {
  id: string;
  label: string;
  path: string;
  skills: DetectedSkill[];
}

export interface DetectedSkillsResponse {
  sources: DetectedSkillSource[];
}
