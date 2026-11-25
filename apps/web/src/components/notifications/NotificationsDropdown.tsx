'use client';

import React, { useRef, useEffect } from 'react';
import { useNotificationStore } from '../../stores/notification.store';
import { useRouter } from 'next/navigation';
import { Avatar } from '../ui/Avatar';
import { Bell, CheckCheck, Loader2, MessageSquare, UserPlus, Info, Heart, MessageCircle, PhoneMissed } from 'lucide-react';
import { cn } from '../../lib/utils';
import { NotificationType } from '@chatterbox/shared';

interface NotificationsDropdownProps {
  onClose: () => void;
  triggerRef?: React.RefObject<HTMLElement | null>;
}

export const NotificationsDropdown: React.FC<NotificationsDropdownProps> = ({
  onClose,
  triggerRef,
}) => {
  const router = useRouter();
  const dropdownRef = useRef<HTMLDivElement>(null);

  const {
    notifications,
    unreadCount,
    hasMore,
    isLoading,
    fetchMoreNotifications,
    markAsRead,
    markAllAsRead,
  } = useNotificationStore();

  // Close when clicking outside (ignoring the bell trigger button so its onClick toggles cleanly)
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef?.current && triggerRef.current.contains(target)) {
        return;
      }
      if (dropdownRef.current && !dropdownRef.current.contains(target)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose, triggerRef]);

  const handleNotificationClick = async (notif: any) => {
    if (!notif.readAt) {
      await markAsRead(notif.id);
    }
    onClose();

    if (notif.postId) {
      router.push(`/posts/${notif.postId}`);
    } else if (notif.type === 'NEW_FOLLOWER' && notif.actor?.username) {
      router.push(`/profile/${notif.actor.username}`);
    } else if (notif.conversationId) {
      router.push(`/messages?c=${notif.conversationId}`);
    }
  };

  const formatRelativeTime = (isoString: string | Date) => {
    try {
      const date = new Date(isoString);
      const diffMs = Date.now() - date.getTime();
      const diffMins = Math.floor(diffMs / (1000 * 60));
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      if (diffMins < 1) return 'now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays === 1) return 'yesterday';
      if (diffDays < 7) return `${diffDays}d ago`;
      return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch {
      return '';
    }
  };

  const getNotificationIcon = (type: NotificationType) => {
    switch (type) {
      case 'NEW_MESSAGE':
        return <MessageSquare className="w-3.5 h-3.5 text-accent-bright" />;
      case 'GROUP_INVITE':
        return <UserPlus className="w-3.5 h-3.5 text-emerald-400" />;
      case 'MENTION':
        return <span className="text-[11px] font-bold text-accent">@</span>;
      case 'NEW_FOLLOWER':
        return <UserPlus className="w-3.5 h-3.5 text-cyan-400" />;
      case 'POST_LIKE':
        return <Heart className="w-3.5 h-3.5 text-rose-500 fill-rose-500" />;
      case 'POST_COMMENT':
        return <MessageCircle className="w-3.5 h-3.5 text-indigo-400" />;
      case 'MISSED_CALL':
        return <PhoneMissed className="w-3.5 h-3.5 text-rose-400" />;
      default:
        return <Info className="w-3.5 h-3.5 text-muted" />;
    }
  };

  return (
    <div
      ref={dropdownRef}
      className="absolute top-14 right-4 sm:right-6 w-80 sm:w-96 rounded-2xl bg-surface border border-border shadow-2xl z-50 overflow-hidden flex flex-col max-h-[500px] animate-in fade-in zoom-in-95 duration-150 select-none"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-elevated/50">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-xs text-primary">Notifications</span>
          {unreadCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-accent text-[10px] font-bold text-white">
              {unreadCount}
            </span>
          )}
        </div>

        {unreadCount > 0 && (
          <button
            type="button"
            onClick={() => markAllAsRead()}
            className="flex items-center gap-1 text-[11px] font-medium text-accent-bright hover:underline"
          >
            <CheckCheck className="w-3.5 h-3.5" />
            <span>Mark all read</span>
          </button>
        )}
      </div>

      {/* Notifications List */}
      <div className="flex-1 overflow-y-auto divide-y divide-border/50">
        {notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center text-muted">
            <div className="w-10 h-10 rounded-full bg-elevated flex items-center justify-center mb-2 text-muted">
              <Bell className="w-5 h-5 opacity-40" />
            </div>
            <p className="text-xs font-medium text-primary">No notifications yet</p>
            <p className="text-[11px] text-muted mt-0.5">
              We&apos;ll notify you when someone messages you or invites you to a group.
            </p>
          </div>
        ) : (
          notifications.map((notif) => {
            const isUnread = !notif.readAt;
            return (
              <div
                key={notif.id}
                onClick={() => handleNotificationClick(notif)}
                className={cn(
                  'flex items-start gap-3 p-3 text-left transition-colors cursor-pointer group',
                  isUnread ? 'bg-accent/5 hover:bg-accent/10' : 'hover:bg-surface-hover',
                )}
              >
                {/* Actor Avatar / Icon */}
                <div className="relative shrink-0 mt-0.5">
                  <Avatar
                    name={notif.actor?.displayName || notif.title}
                    src={notif.actor?.avatarUrl}
                    size="sm"
                  />
                  <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-surface border border-border flex items-center justify-center">
                    {getNotificationIcon(notif.type)}
                  </div>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <span
                      className={cn(
                        'text-xs truncate block',
                        isUnread ? 'font-semibold text-primary' : 'font-medium text-secondary',
                      )}
                    >
                      {notif.title}
                    </span>
                    <span className="text-[10px] text-muted shrink-0">
                      {formatRelativeTime(notif.createdAt)}
                    </span>
                  </div>

                  <p className="text-[11px] text-muted line-clamp-2 mt-0.5 leading-snug">
                    {notif.body}
                  </p>
                </div>

                {/* Unread Purple Dot */}
                {isUnread && (
                  <span className="w-2 h-2 rounded-full bg-accent shrink-0 mt-2" />
                )}
              </div>
            );
          })
        )}

        {/* Load more */}
        {hasMore && (
          <div className="p-2 text-center bg-elevated/30">
            <button
              type="button"
              onClick={() => fetchMoreNotifications()}
              disabled={isLoading}
              className="text-xs text-accent-bright hover:underline font-medium disabled:opacity-50 inline-flex items-center gap-1"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>Loading...</span>
                </>
              ) : (
                <span>Load older notifications</span>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
