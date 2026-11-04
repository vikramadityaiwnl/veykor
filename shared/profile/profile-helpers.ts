import { isValidUsername } from "../auth/auth-helpers.js";
import type { UpdateProfileRequest, UserProfile } from "./profile-contracts.js";

export const profilePaths = {
  profile: "/api/profile",
  data: "/api/profile/data",
} as const;

export const defaultTag = "Building";

export const maxTagLength = 32;

export const maxStatusLength = 140;

export function defaultUserProfile(): UserProfile {
  return {
    username: "",
    tag: defaultTag,
    status: "",
  };
}

export function updateProfileValidationError(
  input: UpdateProfileRequest,
): string {
  if (!isValidUsername(input.username)) {
    return "Use a 3-64 character username with letters, numbers, _, ., or -.";
  }

  const tag = input.tag.trim();

  if (tag === "" || tag.length > maxTagLength) {
    return "Use a 1-32 character tag.";
  }

  if (input.status.trim().length > maxStatusLength) {
    return "Keep status under 140 characters.";
  }

  return "";
}
