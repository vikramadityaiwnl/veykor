import type { AuthUser } from "../auth/index.js";

export interface ConfigurationUsersResponse {
  users: AuthUser[];
}
