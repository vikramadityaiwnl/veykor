import { create } from "zustand";
import { defaultUserProfile } from "@veykor/shared";
import type {
  ChangePasswordRequest,
  UpdateProfileRequest,
  UserProfile,
} from "@veykor/shared";
import {
  changePassword as changePasswordRequest,
  fetchProfile,
  updateProfile,
} from "./profile-client.ts";

interface ProfileState extends UserProfile {
  loaded: boolean;
  loading: boolean;
  saving: boolean;
  error: string;
  passwordError: string;
  load: () => Promise<void>;
  saveProfile: (input: UpdateProfileRequest) => Promise<void>;
  changePassword: (input: ChangePasswordRequest) => Promise<boolean>;
  clearErrors: () => void;
}

export const useProfileStore = create<ProfileState>()((set, get) => ({
  ...defaultUserProfile(),
  loaded: false,
  loading: false,
  saving: false,
  error: "",
  passwordError: "",

  load: async () => {
    const state = get();

    if (state.loaded || state.loading) {
      return;
    }

    set({ loading: true, error: "" });

    try {
      const profile = await fetchProfile();

      set({ ...profile, loaded: true, loading: false });
    } catch (cause) {
      set({
        loading: false,
        error:
          cause instanceof Error ? cause.message : "Unable to load profile.",
      });
    }
  },

  saveProfile: async (input) => {
    set({ saving: true, error: "" });

    try {
      const profile = await updateProfile(input);

      set({ ...profile, saving: false });
    } catch (cause) {
      set({
        saving: false,
        error:
          cause instanceof Error ? cause.message : "Unable to save profile.",
      });
    }
  },

  changePassword: async (input) => {
    set({ saving: true, passwordError: "" });

    try {
      await changePasswordRequest(input);

      set({ saving: false });

      return true;
    } catch (cause) {
      set({
        saving: false,
        passwordError:
          cause instanceof Error ? cause.message : "Unable to change password.",
      });

      return false;
    }
  },

  clearErrors: () => {
    set({ error: "", passwordError: "" });
  },
}));
