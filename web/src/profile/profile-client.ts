import {
  authPaths,
  changePasswordValidationError,
  profilePaths,
  updateProfileValidationError,
  veykorRequestHeaderName,
  veykorRequestHeaderValue,
} from "@veykor/shared";
import type {
  ChangePasswordRequest,
  ChangePasswordResponse,
  UpdateProfileRequest,
  UserProfile,
} from "@veykor/shared";

async function readError(response: Response): Promise<string> {
  const fallback = "Request failed";

  try {
    const body = (await response.json()) as { error?: unknown };

    if (typeof body.error === "string" && body.error !== "") {
      return body.error;
    }

    return fallback;
  } catch {
    return fallback;
  }
}

export async function fetchProfile(): Promise<UserProfile> {
  let response: Response;

  try {
    response = await fetch(profilePaths.profile, {
      credentials: "same-origin",
    });
  } catch {
    throw new Error("Unable to reach the veykor server.");
  }

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return (await response.json()) as UserProfile;
}

export async function updateProfile(
  input: UpdateProfileRequest,
): Promise<UserProfile> {
  const validationError = updateProfileValidationError(input);

  if (validationError !== "") {
    throw new Error(validationError);
  }

  let response: Response;

  try {
    response = await fetch(profilePaths.profile, {
      method: "PUT",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        [veykorRequestHeaderName]: veykorRequestHeaderValue,
      },
      body: JSON.stringify(input),
    });
  } catch {
    throw new Error("Unable to reach the veykor server.");
  }

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return (await response.json()) as UserProfile;
}

export async function changePassword(
  input: ChangePasswordRequest,
): Promise<ChangePasswordResponse> {
  const validationError = changePasswordValidationError(input);

  if (validationError !== "") {
    throw new Error(validationError);
  }

  let response: Response;

  try {
    response = await fetch(authPaths.changePassword, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        [veykorRequestHeaderName]: veykorRequestHeaderValue,
      },
      body: JSON.stringify(input),
    });
  } catch {
    throw new Error("Unable to reach the veykor server.");
  }

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return (await response.json()) as ChangePasswordResponse;
}
