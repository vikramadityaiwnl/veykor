export interface AuthUser {
  id: number;
  username: string;
}

export interface AuthStatus {
  authenticated: boolean;
  user: AuthUser;
  registrationAllowed: boolean;
  expiresAt: number;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  user: AuthUser;
  expiresAt: number;
}

export interface RegisterRequest {
  username: string;
  password: string;
}

export interface RegisterResponse {
  user: AuthUser;
  expiresAt: number;
}

export interface CurrentUserResponse {
  user: AuthUser;
  expiresAt: number;
}
