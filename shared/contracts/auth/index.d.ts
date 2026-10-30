export interface AuthUser {
  id: number;
  username: string;
  photo: string | null;
}

export interface AuthStatus {
  user: AuthUser | null;
  registrationAllowed: boolean;
  expiresAt: number | null;
}

export interface AuthCredentials {
  username: string;
  password: string;
  photo?: string;
}
