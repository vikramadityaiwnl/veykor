export interface DetectedSkill {
  name: string;
  description: string;
  path: string;
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
