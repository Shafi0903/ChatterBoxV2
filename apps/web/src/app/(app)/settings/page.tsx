'use client';

import React, { useState, useEffect } from 'react';
import {
  Sun,
  Moon,
  Monitor,
  Eye,
  Shield,
  Bell,
  CheckCircle2,
} from 'lucide-react';
import { ThemePreference, ProfileVisibility, UserSettings } from '@chatterbox/shared';
import { api, ApiError } from '../../../lib/api';
import { useAuthStore } from '../../../stores/auth.store';
import { useThemeStore } from '../../../stores/theme.store';
import { Button } from '../../../components/ui/Button';
import { Skeleton } from '../../../components/ui/Skeleton';

export default function SettingsPage() {
  const { settings, updateSettingsState } = useAuthStore();
  const { theme, setTheme } = useThemeStore();

  const [currentSettings, setCurrentSettings] = useState<UserSettings | null>(settings);
  const [isLoading, setIsLoading] = useState(!settings);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!settings) {
      api
        .getSettings()
        .then((data) => {
          setCurrentSettings(data);
          updateSettingsState(data);
        })
        .catch(() => {
          setErrorMessage('Failed to load current settings.');
        })
        .finally(() => {
          setIsLoading(false);
        });
    } else {
      setCurrentSettings(settings);
      setIsLoading(false);
    }
  }, [settings, updateSettingsState]);

  const handleUpdate = async (patch: Partial<UserSettings>) => {
    if (!currentSettings) return;

    const updatedOptimistic = { ...currentSettings, ...patch };
    setCurrentSettings(updatedOptimistic);
    setIsSaving(true);
    setSaveSuccess(false);
    setErrorMessage(null);

    // Apply theme locally if changed
    if (patch.theme) {
      setTheme(patch.theme);
    }

    try {
      const saved = await api.updateSettings(patch);
      setCurrentSettings(saved);
      updateSettingsState(saved);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Failed to save settings.');
      }
      // Rollback
      setCurrentSettings(settings);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-3xl mx-auto py-4">
        <Skeleton className="w-48 h-8" />
        <Skeleton className="w-full h-48 rounded-2xl" />
        <Skeleton className="w-full h-64 rounded-2xl" />
      </div>
    );
  }

  const activeTheme = currentSettings?.theme || theme;

  return (
    <div className="space-y-6 max-w-3xl mx-auto pb-12">
      {/* Title */}
      <div className="flex items-center justify-between pb-4 border-b border-border">
        <div>
          <h1 className="text-xl font-bold text-primary">Settings</h1>
          <p className="text-xs text-secondary mt-0.5">
            Manage your account preferences, appearance, and privacy
          </p>
        </div>
        {saveSuccess && (
          <div className="flex items-center gap-1.5 text-xs text-status-online bg-status-online/10 border border-status-online/20 px-3 py-1.5 rounded-xl animate-in fade-in">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Saved successfully</span>
          </div>
        )}
      </div>

      {errorMessage && (
        <div className="p-3 bg-status-busy/15 border border-status-busy/30 rounded-xl text-status-busy text-xs">
          {errorMessage}
        </div>
      )}

      {/* 1. Appearance / Theme */}
      <section className="bg-surface border border-border rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Sun className="w-4 h-4 text-accent-bright" />
          <h2 className="text-sm font-semibold text-primary">Appearance</h2>
        </div>
        <p className="text-xs text-muted">
          Choose how ChatterBox appears on your device.
        </p>

        <div className="grid grid-cols-3 gap-3">
          {[
            { id: 'DARK' as ThemePreference, label: 'Dark Mode', icon: Moon, desc: 'Neon on dark canvas' },
            { id: 'LIGHT' as ThemePreference, label: 'Light Mode', icon: Sun, desc: 'Clean high contrast' },
            { id: 'SYSTEM' as ThemePreference, label: 'System', icon: Monitor, desc: 'Match OS preference' },
          ].map((item) => {
            const Icon = item.icon;
            const isSelected = activeTheme === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleUpdate({ theme: item.id })}
                className={`flex flex-col items-center justify-center p-4 rounded-xl border text-center transition-all ${
                  isSelected
                    ? 'bg-accent/15 border-accent-bright text-accent-bright shadow-sm'
                    : 'bg-elevated/40 border-border text-secondary hover:text-primary hover:bg-elevated'
                }`}
              >
                <Icon className="w-5 h-5 mb-2" />
                <span className="text-xs font-semibold">{item.label}</span>
                <span className="text-[10px] text-muted mt-0.5">{item.desc}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* 2. Privacy & Safety */}
      <section className="bg-surface border border-border rounded-2xl p-6 space-y-5">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-accent-bright" />
          <h2 className="text-sm font-semibold text-primary">Privacy & Visibility</h2>
        </div>

        {/* Profile Visibility */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-border">
          <div>
            <span className="text-xs font-semibold text-primary block">Profile Visibility</span>
            <span className="text-[11px] text-muted">Control who can discover and view your profile.</span>
          </div>
          <select
            value={currentSettings?.profileVisibility || 'PUBLIC'}
            onChange={(e) =>
              handleUpdate({ profileVisibility: e.target.value as ProfileVisibility })
            }
            className="px-3 py-1.5 bg-elevated border border-border rounded-xl text-xs text-primary focus:outline-none focus:border-accent-bright"
          >
            <option value="PUBLIC">Public (Everyone)</option>
            <option value="FOLLOWERS_ONLY">Followers Only</option>
            <option value="PRIVATE">Private</option>
          </select>
        </div>

        {/* Show Online Status */}
        <div className="flex items-center justify-between gap-4 pb-4 border-b border-border">
          <div>
            <span className="text-xs font-semibold text-primary block">Show Online Status</span>
            <span className="text-[11px] text-muted">
              Allow people you share conversations with to see when you are active.
            </span>
          </div>
          <input
            type="checkbox"
            checked={currentSettings?.showOnlineStatus ?? true}
            onChange={(e) => handleUpdate({ showOnlineStatus: e.target.checked })}
            className="w-4 h-4 accent-accent rounded cursor-pointer"
          />
        </div>

        {/* Show Read Receipts */}
        <div className="flex items-center justify-between gap-4 pb-4 border-b border-border">
          <div>
            <span className="text-xs font-semibold text-primary block">Show Read Receipts</span>
            <span className="text-[11px] text-muted">
              Display double checkmarks when you have read messages.
            </span>
          </div>
          <input
            type="checkbox"
            checked={currentSettings?.showReadReceipts ?? true}
            onChange={(e) => handleUpdate({ showReadReceipts: e.target.checked })}
            className="w-4 h-4 accent-accent rounded cursor-pointer"
          />
        </div>

        {/* Allow Direct Messages */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <span className="text-xs font-semibold text-primary block">Allow Direct Messages</span>
            <span className="text-[11px] text-muted">
              Receive direct message requests from any registered user.
            </span>
          </div>
          <input
            type="checkbox"
            checked={currentSettings?.allowDirectMessages ?? true}
            onChange={(e) => handleUpdate({ allowDirectMessages: e.target.checked })}
            className="w-4 h-4 accent-accent rounded cursor-pointer"
          />
        </div>
      </section>

      {/* 3. Notifications */}
      <section className="bg-surface border border-border rounded-2xl p-6 space-y-5">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-accent-bright" />
          <h2 className="text-sm font-semibold text-primary">Notification Preferences</h2>
        </div>

        <div className="flex items-center justify-between gap-4 pb-4 border-b border-border">
          <div>
            <span className="text-xs font-semibold text-primary block">New Messages</span>
            <span className="text-[11px] text-muted">
              Receive notifications for incoming direct and group messages.
            </span>
          </div>
          <input
            type="checkbox"
            checked={currentSettings?.notifyNewMessages ?? true}
            onChange={(e) => handleUpdate({ notifyNewMessages: e.target.checked })}
            className="w-4 h-4 accent-accent rounded cursor-pointer"
          />
        </div>

        <div className="flex items-center justify-between gap-4">
          <div>
            <span className="text-xs font-semibold text-primary block">Mentions</span>
            <span className="text-[11px] text-muted">
              Receive notifications when you are mentioned by @username in a group.
            </span>
          </div>
          <input
            type="checkbox"
            checked={currentSettings?.notifyMentions ?? true}
            onChange={(e) => handleUpdate({ notifyMentions: e.target.checked })}
            className="w-4 h-4 accent-accent rounded cursor-pointer"
          />
        </div>
      </section>
    </div>
  );
}
