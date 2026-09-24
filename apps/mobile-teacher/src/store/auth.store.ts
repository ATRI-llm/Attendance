import { create } from "zustand";
import { getToken, removeToken, saveToken } from "../lib/storage";

export interface AuthUser {
  id: string;
  userCode: string;
  role: string;
}

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  isAuthenticated: boolean;
  hydrated: boolean;
  setAuth: (token: string, user: AuthUser) => Promise<void>;
  hydrate: () => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  user: null,
  isAuthenticated: false,
  hydrated: false,

  setAuth: async (token, user) => {
    await saveToken(token);
    set({ token, user, isAuthenticated: true, hydrated: true });
  },

  hydrate: async () => {
    try {
      const token = await getToken();
      set({ token, isAuthenticated: Boolean(token), hydrated: true });
    } catch {
      set({ token: null, isAuthenticated: false, hydrated: true });
    }
  },

  logout: async () => {
    await removeToken();
    set({ token: null, user: null, isAuthenticated: false, hydrated: true });
  },
}));
