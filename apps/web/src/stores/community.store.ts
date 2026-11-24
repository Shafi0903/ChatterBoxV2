import { create } from 'zustand';
import {
  CommunityItem,
  CommunityDetail,
  ChannelItem,
  ChannelMessageItem,
  SocketEvents,
  CommunityRole,
} from '@chatterbox/shared';
import { api } from '../lib/api';
import { getSocket } from '../lib/socket';

interface CommunityState {
  communities: CommunityItem[];
  activeCommunityId: string | null;
  activeCommunityDetail: CommunityDetail | null;
  activeChannelId: string | null;
  messagesByChannelId: Record<string, ChannelMessageItem[]>;
  hasMoreByChannelId: Record<string, boolean>;
  nextCursorByChannelId: Record<string, string | null>;
  typingByChannelId: Record<string, { userId: string; displayName: string }[]>;

  isLoadingCommunities: boolean;
  isLoadingDetail: boolean;
  isLoadingMessages: boolean;
  isLoadingMoreMessages: boolean;
  isMembersPanelOpen: boolean;
  replyingTo: ChannelMessageItem | null;

  // Actions
  setReplyingTo: (msg: ChannelMessageItem | null) => void;
  toggleMembersPanel: () => void;
  setMembersPanelOpen: (open: boolean) => void;

  fetchMyCommunities: () => Promise<void>;
  selectCommunity: (communityId: string | null, targetChannelId?: string) => Promise<void>;
  selectChannel: (channelId: string) => Promise<void>;
  fetchOlderMessages: (channelId: string) => Promise<void>;
  sendMessage: (
    channelId: string,
    content: string,
    replyToId?: string,
    attachmentIds?: string[],
    stagedAttachments?: any[],
  ) => Promise<void>;
  editMessage: (messageId: string, content: string) => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;
  emitTyping: (channelId: string, isTyping: boolean) => void;

  initSocketListeners: () => void;
  cleanupSocketListeners: () => void;
  resetCommunityState: () => void;
}

// Module-level typing timeout tracker (4s)
const typingTimeoutMap = new Map<string, NodeJS.Timeout>();

export const useCommunityStore = create<CommunityState>((set, get) => ({
  communities: [],
  activeCommunityId: null,
  activeCommunityDetail: null,
  activeChannelId: null,
  messagesByChannelId: {},
  hasMoreByChannelId: {},
  nextCursorByChannelId: {},
  typingByChannelId: {},

  isLoadingCommunities: false,
  isLoadingDetail: false,
  isLoadingMessages: false,
  isLoadingMoreMessages: false,
  isMembersPanelOpen: true,
  replyingTo: null,

  setReplyingTo: (msg) => set({ replyingTo: msg }),
  toggleMembersPanel: () => set((state) => ({ isMembersPanelOpen: !state.isMembersPanelOpen })),
  setMembersPanelOpen: (open) => set({ isMembersPanelOpen: open }),

  fetchMyCommunities: async () => {
    set({ isLoadingCommunities: true });
    try {
      const communities = await api.getMyCommunities();
      set({ communities, isLoadingCommunities: false });
    } catch (err) {
      set({ isLoadingCommunities: false });
      throw err;
    }
  },

  selectCommunity: async (communityId, targetChannelId) => {
    if (!communityId) {
      const prevChannel = get().activeChannelId;
      if (prevChannel) {
        const socket = getSocket();
        socket?.emit(SocketEvents.CHANNEL_LEAVE, { channelId: prevChannel });
      }
      set({
        activeCommunityId: null,
        activeCommunityDetail: null,
        activeChannelId: null,
        replyingTo: null,
      });
      return;
    }

    set({ isLoadingDetail: true, activeCommunityId: communityId });
    try {
      const detail = await api.getCommunity(communityId);
      set({ activeCommunityDetail: detail, isLoadingDetail: false });

      // Determine channel to select
      let channelToSelect = targetChannelId;
      if (!channelToSelect && detail.channels && detail.channels.length > 0) {
        // Prefer 'general' or the first channel
        const general = detail.channels.find((c) => c.name === 'general');
        channelToSelect = general ? general.id : detail.channels[0].id;
      }

      if (channelToSelect) {
        await get().selectChannel(channelToSelect);
      }
    } catch (err) {
      set({ isLoadingDetail: false });
      throw err;
    }
  },

  selectChannel: async (channelId) => {
    const prevChannel = get().activeChannelId;
    const socket = getSocket();

    if (prevChannel && prevChannel !== channelId) {
      socket?.emit(SocketEvents.CHANNEL_LEAVE, { channelId: prevChannel });
    }

    set({ activeChannelId: channelId, replyingTo: null });

    // Adjustment #3: Join socket room for active channel
    if (socket && socket.connected) {
      socket.emit(SocketEvents.CHANNEL_JOIN, { channelId });
    }

    // Load initial messages if not already loaded or empty
    const existing = get().messagesByChannelId[channelId];
    if (!existing || existing.length === 0) {
      set({ isLoadingMessages: true });
      try {
        const res = await api.getChannelMessages(channelId, undefined, 50);
        set((state) => ({
          isLoadingMessages: false,
          messagesByChannelId: {
            ...state.messagesByChannelId,
            [channelId]: res.data,
          },
          hasMoreByChannelId: {
            ...state.hasMoreByChannelId,
            [channelId]: res.meta.hasMore,
          },
          nextCursorByChannelId: {
            ...state.nextCursorByChannelId,
            [channelId]: res.meta.nextCursor,
          },
        }));
      } catch (err) {
        set({ isLoadingMessages: false });
        throw err;
      }
    }
  },

  fetchOlderMessages: async (channelId) => {
    const { isLoadingMoreMessages, hasMoreByChannelId, nextCursorByChannelId } = get();
    if (isLoadingMoreMessages || !hasMoreByChannelId[channelId]) return;

    const cursor = nextCursorByChannelId[channelId];
    if (!cursor) return;

    set({ isLoadingMoreMessages: true });
    try {
      const res = await api.getChannelMessages(channelId, cursor, 50);
      set((state) => {
        const currentList = state.messagesByChannelId[channelId] || [];
        const existingIds = new Set(currentList.map((m) => m.id));
        const newOlder = res.data.filter((m) => !existingIds.has(m.id));

        return {
          isLoadingMoreMessages: false,
          messagesByChannelId: {
            ...state.messagesByChannelId,
            [channelId]: [...newOlder, ...currentList],
          },
          hasMoreByChannelId: {
            ...state.hasMoreByChannelId,
            [channelId]: res.meta.hasMore,
          },
          nextCursorByChannelId: {
            ...state.nextCursorByChannelId,
            [channelId]: res.meta.nextCursor,
          },
        };
      });
    } catch (err) {
      set({ isLoadingMoreMessages: false });
      throw err;
    }
  },

  sendMessage: async (channelId, content, replyToId, attachmentIds, stagedAttachments) => {
    const clientMessageId = `cm_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    // Optimistic item
    const optimisticMessage: ChannelMessageItem = {
      id: clientMessageId,
      channelId,
      senderId: 'optimistic-self',
      sender: {
        id: 'optimistic-self',
        username: 'me',
        displayName: 'Me',
        avatarUrl: null,
      },
      clientMessageId,
      content,
      replyToId: replyToId || null,
      replyTo: get().replyingTo
        ? {
            id: get().replyingTo!.id,
            content: get().replyingTo!.content,
            senderId: get().replyingTo!.senderId,
            senderName: get().replyingTo!.sender.displayName,
          }
        : null,
      attachments: stagedAttachments || [],
      editedAt: null,
      deletedAt: null,
      createdAt: new Date().toISOString(),
    };

    set((state) => ({
      replyingTo: null,
      messagesByChannelId: {
        ...state.messagesByChannelId,
        [channelId]: [...(state.messagesByChannelId[channelId] || []), optimisticMessage],
      },
    }));

    try {
      const created = await api.sendChannelMessage(channelId, {
        clientMessageId,
        content,
        replyToId,
        attachmentIds: attachmentIds || [],
      });

      // Replace optimistic placeholder
      set((state) => {
        const list = state.messagesByChannelId[channelId] || [];
        const index = list.findIndex(
          (m) => m.clientMessageId === clientMessageId || m.id === clientMessageId,
        );
        if (index === -1) {
          // If already added by socket
          const exists = list.some((m) => m.id === created.id);
          return exists ? state : {
            messagesByChannelId: {
              ...state.messagesByChannelId,
              [channelId]: [...list, created],
            },
          };
        }

        const updated = [...list];
        updated[index] = created;
        return {
          messagesByChannelId: {
            ...state.messagesByChannelId,
            [channelId]: updated,
          },
        };
      });
    } catch (err) {
      // Remove optimistic item on failure
      set((state) => ({
        messagesByChannelId: {
          ...state.messagesByChannelId,
          [channelId]: (state.messagesByChannelId[channelId] || []).filter(
            (m) => m.clientMessageId !== clientMessageId && m.id !== clientMessageId,
          ),
        },
      }));
      throw err;
    }
  },

  editMessage: async (messageId, content) => {
    const updated = await api.editChannelMessage(messageId, { content });
    set((state) => {
      const channelId = updated.channelId;
      const list = state.messagesByChannelId[channelId] || [];
      return {
        messagesByChannelId: {
          ...state.messagesByChannelId,
          [channelId]: list.map((m) => (m.id === messageId ? updated : m)),
        },
      };
    });
  },

  deleteMessage: async (messageId) => {
    await api.deleteChannelMessage(messageId);
    set((state) => {
      const nextMessages = { ...state.messagesByChannelId };
      for (const [chId, list] of Object.entries(nextMessages)) {
        nextMessages[chId] = list.map((m) =>
          m.id === messageId ? { ...m, deletedAt: new Date().toISOString(), content: '' } : m,
        );
      }
      return { messagesByChannelId: nextMessages };
    });
  },

  emitTyping: (channelId, isTyping) => {
    const socket = getSocket();
    if (!socket || !socket.connected) return;
    const evt = isTyping
      ? SocketEvents.CHANNEL_TYPING_START
      : SocketEvents.CHANNEL_TYPING_STOP;
    socket.emit(evt, { channelId });
  },

  initSocketListeners: () => {
    const socket = getSocket();
    if (!socket) return;

    // StrictMode cleanup first
    socket.off(SocketEvents.CHANNEL_MESSAGE_NEW);
    socket.off(SocketEvents.CHANNEL_MESSAGE_UPDATED);
    socket.off(SocketEvents.CHANNEL_MESSAGE_DELETED);
    socket.off(SocketEvents.CHANNEL_TYPING_UPDATE);
    socket.off('connect');

    // Adjustment #3: Auto-rejoin on reconnect
    socket.on('connect', () => {
      const activeChannel = get().activeChannelId;
      if (activeChannel) {
        socket.emit(SocketEvents.CHANNEL_JOIN, { channelId: activeChannel });
      }
    });

    socket.on(SocketEvents.CHANNEL_MESSAGE_NEW, (payload: { message: ChannelMessageItem }) => {
      const message = payload.message;
      if (!message || !message.channelId) return;

      set((state) => {
        const list = state.messagesByChannelId[message.channelId] || [];
        // If clientMessageId exists in list, replace it
        const optIndex = list.findIndex(
          (m) =>
            m.clientMessageId === message.clientMessageId ||
            m.id === message.id,
        );
        if (optIndex !== -1) {
          const updated = [...list];
          updated[optIndex] = message;
          return {
            messagesByChannelId: {
              ...state.messagesByChannelId,
              [message.channelId]: updated,
            },
          };
        }

        return {
          messagesByChannelId: {
            ...state.messagesByChannelId,
            [message.channelId]: [...list, message],
          },
        };
      });
    });

    socket.on(SocketEvents.CHANNEL_MESSAGE_UPDATED, (payload: { message: ChannelMessageItem }) => {
      const message = payload.message;
      if (!message || !message.channelId) return;

      set((state) => {
        const list = state.messagesByChannelId[message.channelId] || [];
        return {
          messagesByChannelId: {
            ...state.messagesByChannelId,
            [message.channelId]: list.map((m) => (m.id === message.id ? message : m)),
          },
        };
      });
    });

    socket.on(SocketEvents.CHANNEL_MESSAGE_DELETED, (payload: { messageId: string; channelId: string }) => {
      const { messageId, channelId } = payload;
      if (!messageId || !channelId) return;

      set((state) => {
        const list = state.messagesByChannelId[channelId] || [];
        return {
          messagesByChannelId: {
            ...state.messagesByChannelId,
            [channelId]: list.map((m) =>
              m.id === messageId ? { ...m, deletedAt: new Date().toISOString(), content: '' } : m,
            ),
          },
        };
      });
    });

    socket.on(
      SocketEvents.CHANNEL_TYPING_UPDATE,
      (payload: { channelId: string; userId: string; displayName: string; isTyping: boolean }) => {
        const { channelId, userId, displayName, isTyping } = payload;
        if (!channelId || !userId) return;

        const timerKey = `${channelId}_${userId}`;
        const existingTimer = typingTimeoutMap.get(timerKey);
        if (existingTimer) {
          clearTimeout(existingTimer);
          typingTimeoutMap.delete(timerKey);
        }

        set((state) => {
          const currentTypers = state.typingByChannelId[channelId] || [];
          if (isTyping) {
            // Add if not already present
            const exists = currentTypers.some((t) => t.userId === userId);
            const updated = exists
              ? currentTypers
              : [...currentTypers, { userId, displayName }];

            // Auto-clear after 4s
            const timer = setTimeout(() => {
              set((st) => ({
                typingByChannelId: {
                  ...st.typingByChannelId,
                  [channelId]: (st.typingByChannelId[channelId] || []).filter(
                    (t) => t.userId !== userId,
                  ),
                },
              }));
              typingTimeoutMap.delete(timerKey);
            }, 4000);
            typingTimeoutMap.set(timerKey, timer);

            return {
              typingByChannelId: {
                ...state.typingByChannelId,
                [channelId]: updated,
              },
            };
          } else {
            return {
              typingByChannelId: {
                ...state.typingByChannelId,
                [channelId]: currentTypers.filter((t) => t.userId !== userId),
              },
            };
          }
        });
      },
    );
  },

  cleanupSocketListeners: () => {
    const socket = getSocket();
    if (!socket) return;
    const active = get().activeChannelId;
    if (active) {
      socket.emit(SocketEvents.CHANNEL_LEAVE, { channelId: active });
    }
    socket.off(SocketEvents.CHANNEL_MESSAGE_NEW);
    socket.off(SocketEvents.CHANNEL_MESSAGE_UPDATED);
    socket.off(SocketEvents.CHANNEL_MESSAGE_DELETED);
    socket.off(SocketEvents.CHANNEL_TYPING_UPDATE);
  },

  resetCommunityState: () => {
    get().cleanupSocketListeners();
    set({
      communities: [],
      activeCommunityId: null,
      activeCommunityDetail: null,
      activeChannelId: null,
      messagesByChannelId: {},
      hasMoreByChannelId: {},
      nextCursorByChannelId: {},
      typingByChannelId: {},
      isLoadingCommunities: false,
      isLoadingDetail: false,
      isLoadingMessages: false,
      isLoadingMoreMessages: false,
      replyingTo: null,
    });
  },
}));
