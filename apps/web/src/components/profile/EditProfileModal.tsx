'use client';

import React, { useState, useEffect } from 'react';
import { updateProfileSchema, UserProfile } from '@chatterbox/shared';
import { api, ApiError } from '../../lib/api';
import { useAuthStore } from '../../stores/auth.store';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';

interface EditProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentProfile: UserProfile | null;
  onProfileUpdated: (updated: UserProfile) => void;
}

export const EditProfileModal: React.FC<EditProfileModalProps> = ({
  isOpen,
  onClose,
  currentProfile,
  onProfileUpdated,
}) => {
  const updateProfileState = useAuthStore((s) => s.updateProfileState);

  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [location, setLocation] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen && currentProfile) {
      setDisplayName(currentProfile.displayName || '');
      setBio(currentProfile.bio || '');
      setLocation(currentProfile.location || '');
      setAvatarUrl(currentProfile.avatarUrl || '');
      setTagsInput(currentProfile.tags?.join(', ') || '');
      setFieldErrors({});
      setServerError(null);
    }
  }, [isOpen, currentProfile]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldError(null);
    setFieldErrors({});

    // User adjustment #3: Normalize empty string inputs ("") for optional fields to null
    const payload = {
      displayName: displayName.trim() || undefined,
      bio: bio.trim() ? bio.trim() : null,
      location: location.trim() ? location.trim() : null,
      avatarUrl: avatarUrl.trim() ? avatarUrl.trim() : null,
      tags: tagsInput
        ? tagsInput
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean)
        : [],
    };

    const result = updateProfileSchema.safeParse(payload);
    if (!result.success) {
      const errors: Record<string, string> = {};
      result.error.errors.forEach((err) => {
        const field = err.path[0] as string;
        if (field && !errors[field]) {
          errors[field] = err.message;
        }
      });
      setFieldErrors(errors);
      return;
    }

    setIsLoading(true);
    try {
      const updated = await api.updateProfile(result.data);
      updateProfileState(updated);
      onProfileUpdated(updated);
      onClose();
    } catch (err) {
      if (err instanceof ApiError) {
        setServerError(err.message);
      } else {
        setServerError('Failed to update profile. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  function setFieldError(err: null) {
    setServerError(err);
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Edit Profile"
      description="Update your public profile information"
    >
      {serverError && (
        <div className="mb-4 p-3 rounded-xl bg-status-busy/15 border border-status-busy/30 text-status-busy text-xs font-medium">
          {serverError}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
        <Input
          label="Display Name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          error={fieldErrors.displayName}
          placeholder="Your name"
          required
        />

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-secondary uppercase tracking-wider">
              Bio
            </label>
            <span className="text-[10px] text-muted">{bio.length}/280</span>
          </div>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={280}
            rows={3}
            placeholder="Tell the community about yourself..."
            className="w-full px-3.5 py-2.5 bg-elevated border border-border rounded-xl text-primary text-sm placeholder:text-muted focus:outline-none focus:border-accent-bright focus:ring-1 focus:ring-accent-bright resize-none"
          />
          {fieldErrors.bio && (
            <span className="text-xs text-status-busy font-medium">
              {fieldErrors.bio}
            </span>
          )}
        </div>

        <Input
          label="Location"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          error={fieldErrors.location}
          placeholder="e.g. San Francisco, CA or Remote"
        />

        <Input
          label="Avatar URL"
          type="url"
          value={avatarUrl}
          onChange={(e) => setAvatarUrl(e.target.value)}
          error={fieldErrors.avatarUrl}
          placeholder="https://example.com/avatar.jpg"
          hint="Leave empty to use default initials"
        />

        <Input
          label="Interest Tags"
          value={tagsInput}
          onChange={(e) => setTagsInput(e.target.value)}
          error={fieldErrors.tags}
          placeholder="gaming, coding, neon, music (comma separated)"
          hint="Up to 10 tags separated by commas"
        />

        <div className="flex items-center justify-end gap-3 mt-4 pt-3 border-t border-border">
          <Button
            type="button"
            variant="ghost"
            size="md"
            onClick={onClose}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="md"
            isLoading={isLoading}
          >
            Save Changes
          </Button>
        </div>
      </form>
    </Modal>
  );
};
