import { SafeUser } from './user.types';
import { UserProfile } from './profile.types';
import { UserSettings } from './settings.types';

export interface AuthResponse {
  user: SafeUser;
  accessToken: string;
}

export interface RefreshResponse {
  accessToken: string;
}

export interface AuthMeResponse {
  user: SafeUser;
  profile: UserProfile | null;
  settings: UserSettings | null;
}
