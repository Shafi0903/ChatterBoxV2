export interface SafeUser {
  id: string;
  email: string;
  username: string;
  emailVerifiedAt: Date | string | null;
  isActive: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
}
