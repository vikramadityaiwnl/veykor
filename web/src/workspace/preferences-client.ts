import {
  preferencesPaths,
  veykorRequestHeaderName,
  veykorRequestHeaderValue,
} from "@veykor/shared";
import type { UserPreferences } from "@veykor/shared";

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

export async function fetchPreferences(): Promise<UserPreferences> {
  let response: Response;

  try {
    response = await fetch(preferencesPaths.preferences, {
      credentials: "same-origin",
    });
  } catch {
    throw new Error("Unable to reach the veykor server.");
  }

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return (await response.json()) as UserPreferences;
}

export async function savePreferences(
  input: UserPreferences,
): Promise<UserPreferences> {
  let response: Response;

  try {
    response = await fetch(preferencesPaths.preferences, {
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

  return (await response.json()) as UserPreferences;
}
