import {
  authPaths,
  loginValidationError,
  registerValidationError,
  veykorRequestHeaderName,
  veykorRequestHeaderValue,
} from "@veykor/shared";
import type {
  AuthStatus,
  LoginRequest,
  LoginResponse,
  RegisterRequest,
  RegisterResponse,
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

async function send(path: string, body: unknown): Promise<Response> {
  try {
    return await fetch(path, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        [veykorRequestHeaderName]: veykorRequestHeaderValue,
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("Unable to reach the veykor server.");
  }
}

export async function fetchStatus(): Promise<AuthStatus> {
  let response: Response;

  try {
    response = await fetch(authPaths.status, {
      credentials: "same-origin",
    });
  } catch {
    throw new Error("Unable to reach the veykor server.");
  }

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return (await response.json()) as AuthStatus;
}

export async function login(input: LoginRequest): Promise<LoginResponse> {
  const validationError = loginValidationError(input);

  if (validationError !== "") {
    throw new Error(validationError);
  }

  const response = await send(authPaths.login, input);

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return (await response.json()) as LoginResponse;
}

export async function register(
  input: RegisterRequest,
): Promise<RegisterResponse> {
  const validationError = registerValidationError(input);

  if (validationError !== "") {
    throw new Error(validationError);
  }

  const response = await send(authPaths.register, input);

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return (await response.json()) as RegisterResponse;
}

export async function logout(): Promise<void> {
  const response = await send(authPaths.logout, {});

  if (!response.ok) {
    throw new Error(await readError(response));
  }
}
