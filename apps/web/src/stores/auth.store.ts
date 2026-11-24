import { create } from 'zustand';
import {
  SafeUser,
  UserProfile,
  UserSettings,
  RegisterDto,
  LoginDto,
} from '@chatterbox/shared';
import { api, setAccessToken } from '../lib/api';
import { disconnectSocket } from '../lib/socket';
import { useThemeStore } from './theme.store';
import { useChatStore } from './chat.store';
import { useNotificationStore } from './notification.store';
import { useCommunityStore } from './community.store';

interface AuthState {
  user: SafeUser | null;
  profile: UserProfile | null;
  settings: UserSettings | null;
  isLoading: boolean;
  isInitialized: boolean;

  initializeAuth: () => Promise<void>;
  register: (dto: RegisterDto) => Promise<void>;
  login: (dto: LoginDto) => Promise<void>;
  logout: () => Promise<void>;
  updateProfileState: (profile: UserProfile) => void;
  updateSettingsState: (settings: UserSettings) => void;
}

// Module-level guard preventing duplicate initializeAuth calls from React 19 StrictMode
let isInitializing = false;

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  profile: null,
  settings: null,
  isLoading: false,
  isInitialized: false,

  initializeAuth: async () => {
    // Return early if already initialized or actively initializing
    if (get().isInitialized || isInitializing) {
      return;
    }

    isInitializing = true;
    set({ isLoading: true });

    try {
      // 1. Single-flight silent refresh from HttpOnly cookie
      const token = await api.refresh();
      if (!token) {
        set({
          user: null,
          profile: null,
          settings: null,
          isLoading: false,
          isInitialized: true,
        });
        return;
      }

      // 2. Fetch authenticated profile & settings
      const me = await api.getMe();
      set({
        user: me.user,
        profile: me.profile,
        settings: me.settings,
        isLoading: false,
        isInitialized: true,
      });

      // Synchronize theme preference
      if (me.settings?.theme) {
        useThemeStore.getState().applyTheme(me.settings.theme);
      }
    } catch {
      setAccessToken(null);
      set({
        user: null,
        profile: null,
        settings: null,
        isLoading: false,
        isInitialized: true,
      });
    } finally {
      isInitializing = false;
    }
  },

  register: async (dto: RegisterDto) => {
    set({ isLoading: true });
    try {
      const response = await api.register(dto);
      setAccessToken(response.accessToken);

      // Fetch profile & default settings
      const me = await api.getMe();
      set({
        user: me.user,
        profile: me.profile,
        settings: me.settings,
        isLoading: false,
        isInitialized: true,
      });

      if (me.settings?.theme) {
        useThemeStore.getState().applyTheme(me.settings.theme);
      }
    } catch (err) {
      set({ isLoading: false });
      throw err;
    }
  },

  login: async (dto: LoginDto) => {
    set({ isLoading: true });
    try {
      const response = await api.login(dto);
      setAccessToken(response.accessToken);

      const me = await api.getMe();
      set({
        user: me.user,
        profile: me.profile,
        settings: me.settings,
        isLoading: false,
        isInitialized: true,
      });

      if (me.settings?.theme) {
        useThemeStore.getState().applyTheme(me.settings.theme);
      }
    } catch (err) {
      set({ isLoading: false });
      throw err;
    }
  },

  logout: async () => {
    set({ isLoading: true });
    try {
      await api.logout();
    } catch {
      // Continue cleanup even if server call fails
    } finally {
      disconnectSocket();
      useChatStore.getState().resetChatState();
      useNotificationStore.getState().resetNotificationState();
      useCommunityStore.getState().resetCommunityState();
      setAccessToken(null);
      set({
        user: null,
        profile: null,
        settings: null,
        isLoading: false,
        isInitialized: true,
      });
    }
  },

  updateProfileState: (profile: UserProfile) => {
    set({ profile });
  },

  updateSettingsState: (settings: UserSettings) => {
    set({ settings });
    if (settings.theme) {
      useThemeStore.getState().applyTheme(settings.theme);
    }
  },
}));
