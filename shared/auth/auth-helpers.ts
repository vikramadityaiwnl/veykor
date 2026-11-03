import type {
  AuthStatus,
  AuthUser,
  LoginRequest,
  RegisterRequest,
} from "./auth-contracts.js";

export function defaultAuthUser(): AuthUser {
  return {
    id: 0,
    username: "",
  };
}

export function defaultAuthStatus(registrationAllowed: boolean): AuthStatus {
  return {
    authenticated: false,
    user: defaultAuthUser(),
    registrationAllowed,
    expiresAt: 0,
  };
}

export const authPaths = {
  status: "/api/auth/status",
  login: "/api/auth/login",
  logout: "/api/auth/logout",
  register: "/api/auth/register",
  me: "/api/me",
} as const;

export const veykorRequestHeaderName = "X-Veykor-Request";

export const veykorRequestHeaderValue = "1";

export const usernamePattern = /^[a-zA-Z0-9_.-]{3,64}$/;

export const minPasswordLength = 8;

export const maxPasswordLength = 256;

export function isValidUsername(username: string): boolean {
  return usernamePattern.test(username);
}

export function isValidPassword(password: string): boolean {
  return (
    password.length >= minPasswordLength && password.length <= maxPasswordLength
  );
}

export function isValidLoginPassword(password: string): boolean {
  return password.length >= 1 && password.length <= maxPasswordLength;
}

export function loginValidationError(input: LoginRequest): string {
  if (
    !isValidUsername(input.username) ||
    !isValidLoginPassword(input.password)
  ) {
    return "Enter a valid username and password.";
  }

  return "";
}

export function registerValidationError(input: RegisterRequest): string {
  if (!isValidUsername(input.username)) {
    return "Use a 3-64 character username with letters, numbers, _, ., or -.";
  }

  if (!isValidPassword(input.password)) {
    return "Use an 8-256 character password.";
  }

  return "";
}
