export type ThemePreference = 'DARK' | 'LIGHT' | 'SYSTEM';
export type ProfileVisibility = 'PUBLIC' | 'FOLLOWERS_ONLY' | 'PRIVATE';

export interface UserSettings {
  id: string;
  userId: string;
  theme: ThemePreference;
  profileVisibility: ProfileVisibility;
  showOnlineStatus: boolean;
  showReadReceipts: boolean;
  allowDirectMessages: boolean;
  notifyNewMessages: boolean;
  notifyMentions: boolean;
  updatedAt: Date | string;
}
