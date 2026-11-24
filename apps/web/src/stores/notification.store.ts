import { create } from 'zustand';
import { NotificationItem, SocketEvents } from '@chatterbox/shared';
import { api } from '../lib/api';
import { getSocket } from '../lib/socket';

interface NotificationState {
  notifications: NotificationItem[];
  unreadCount: number;
  nextCursor: string | null;
  hasMore: boolean;
  isLoading: boolean;
  isOpen: boolean;

  // Actions
  setIsOpen: (isOpen: boolean) => void;
  toggleIsOpen: () => void;
  fetchNotifications: () => Promise<void>;
  fetchMoreNotifications: () => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  handleNewNotification: (notification: NotificationItem) => void;
  initSocketListeners: () => void;
  resetNotificationState: () => void;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  nextCursor: null,
  hasMore: false,
  isLoading: false,
  isOpen: false,

  setIsOpen: (isOpen) => set({ isOpen }),
  toggleIsOpen: () => set((state) => ({ isOpen: !state.isOpen })),

  fetchNotifications: async () => {
    set({ isLoading: true });
    try {
      const res = await api.getNotifications(undefined, 20);
      set({
        notifications: res.data,
        unreadCount: res.meta.unreadCount,
        nextCursor: res.meta.nextCursor,
        hasMore: res.meta.hasMore,
        isLoading: false,
      });
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
      set({ isLoading: false });
    }
  },

  fetchMoreNotifications: async () => {
    const { nextCursor, hasMore, isLoading, notifications } = get();
    if (!hasMore || !nextCursor || isLoading) return;

    set({ isLoading: true });
    try {
      const res = await api.getNotifications(nextCursor, 20);
      set({
        notifications: [...notifications, ...res.data],
        unreadCount: res.meta.unreadCount,
        nextCursor: res.meta.nextCursor,
        hasMore: res.meta.hasMore,
        isLoading: false,
      });
    } catch (err) {
      console.error('Failed to load more notifications:', err);
      set({ isLoading: false });
    }
  },

  markAsRead: async (id: string) => {
    const { notifications, unreadCount } = get();
    const target = notifications.find((n) => n.id === id);
    if (!target || target.readAt) return;

    // Optimistic update
    const updated = notifications.map((n) =>
      n.id === id ? { ...n, readAt: new Date().toISOString() } : n
    );
    set({
      notifications: updated,
      unreadCount: Math.max(0, unreadCount - 1),
    });

    try {
      await api.markNotificationRead(id);
    } catch (err) {
      console.error('Failed to mark notification as read:', err);
    }
  },

  markAllAsRead: async () => {
    const { notifications, unreadCount } = get();
    if (unreadCount === 0) return;

    const now = new Date().toISOString();
    const updated = notifications.map((n) => ({ ...n, readAt: n.readAt || now }));
    set({
      notifications: updated,
      unreadCount: 0,
    });

    try {
      await api.markAllNotificationsRead();
    } catch (err) {
      console.error('Failed to mark all notifications as read:', err);
    }
  },

  handleNewNotification: (notification: NotificationItem) => {
    const { notifications, unreadCount } = get();
    // Deduplicate by ID
    if (notifications.some((n) => n.id === notification.id)) {
      return;
    }

    set({
      notifications: [notification, ...notifications],
      unreadCount: unreadCount + 1,
    });
  },

  initSocketListeners: () => {
    const socket = getSocket();
    if (!socket) return;

    // Adjustment #3: Deduplicate socket listener to prevent React 19 StrictMode double-binding
    socket.off(SocketEvents.NOTIFICATION_NEW);
    socket.on(
      SocketEvents.NOTIFICATION_NEW,
      (data: { notification: NotificationItem }) => {
        if (data?.notification) {
          get().handleNewNotification(data.notification);
        }
      }
    );
  },

  resetNotificationState: () => {
    const socket = getSocket();
    if (socket) {
      socket.off(SocketEvents.NOTIFICATION_NEW);
    }
    set({
      notifications: [],
      unreadCount: 0,
      nextCursor: null,
      hasMore: false,
      isLoading: false,
      isOpen: false,
    });
  },
}));
