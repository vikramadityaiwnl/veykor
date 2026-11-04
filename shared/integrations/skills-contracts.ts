export interface SkillSummary {
  id: string;
  slug: string;
  name: string;
  description: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SkillDetail extends SkillSummary {
  instructions: string;
}

export interface SkillListResponse {
  skills: Array<SkillSummary>;
}

export interface CreateSkillRequest {
  name?: string;
  description?: string;
  instructions?: string;
  enabled?: boolean;
}

export interface UpdateSkillRequest {
  description?: string;
  instructions?: string;
  enabled?: boolean;
}

export interface SessionSkillRow {
  selector: string;
  displayName: string;
  description: string;
  source: string;
}

export interface ChatSkillsResponse {
  skills: Array<SessionSkillRow>;
}
