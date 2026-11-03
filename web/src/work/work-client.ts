import {
  veykorRequestHeaderName,
  veykorRequestHeaderValue,
} from "@veykor/shared";

export async function workRequest<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch(`/api/${path}`, {
    method,
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      [veykorRequestHeaderName]: veykorRequestHeaderValue,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error ?? "Request failed.");
  }

  return result as T;
}
