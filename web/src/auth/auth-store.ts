import { create } from "zustand";
import type { AuthCredentials, AuthStatus } from "@veykor/shared";

interface AuthState {
  status: AuthStatus | null;
  error: string;
  refresh: () => Promise<void>;
  submit: (
    action: "register" | "login",
    input: AuthCredentials,
  ) => Promise<void>;
  logout: () => Promise<void>;
  expire: () => void;
}

let requestVersion = 0;

async function request<Response>(
  path: string,
  input?: unknown,
): Promise<Response> {
  const response = await fetch("/api/auth/" + path, {
    credentials: "same-origin",
    ...(input !== undefined
      ? {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Veykor-Request": "1",
          },
          body: JSON.stringify(input),
        }
      : {}),
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error ?? "Request failed");
  }

  return result;
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  status: null,
  error: "",

  refresh: async () => {
    const version = ++requestVersion;

    try {
      const status = await request<AuthStatus>("status");

      if (version === requestVersion) {
        set({ status, error: "" });
      }
    } catch {
      if (version === requestVersion) {
        set({
          status: null,
          error: "Unable to check your session. Please retry.",
        });
      }
    }
  },

  submit: async (action, input) => {
    ++requestVersion;

    const status = await request<AuthStatus>(action, input);

    ++requestVersion;
    set({ status, error: "" });
  },

  logout: async () => {
    ++requestVersion;

    try {
      await request("logout", {});
    } catch (error) {
      await get().refresh();

      throw error;
    }

    ++requestVersion;
    set({
      status: { user: null, expiresAt: null, registrationAllowed: false },
    });

    await get().refresh();
  },

  expire: () => {
    ++requestVersion;
    set({
      status: { user: null, expiresAt: null, registrationAllowed: false },
    });
  },
}));
