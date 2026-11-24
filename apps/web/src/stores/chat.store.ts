import { create } from 'zustand';
import {
  ConversationItem,
  ConversationDetail,
  MessageItem,
  PresenceStatus,
  SocketEvents,
  MessageStatusPayload,
  MessageUpdatedPayload,
  MessageDeletedPayload,
  MessageReactionPayload,
  TypingUpdatePayload,
  PresenceChangedPayload,
  ConversationUpdatedPayload,
} from '@chatterbox/shared';
import { api } from '../lib/api';
import { getSocket } from '../lib/socket';
import { useAuthStore } from './auth.store';

interface ChatState {
  conversations: ConversationItem[];
  activeConversationId: string | null;
  activeConversationDetail: ConversationDetail | null;
  messagesByConversationId: Record<string, MessageItem[]>;
  hasMoreByConversationId: Record<string, boolean>;
  nextCursorByConversationId: Record<string, string | null>;
  isLoadingConversations: boolean;
  isLoadingMessages: boolean;
  isLoadingMoreMessages: boolean;
  isDetailsOpen: boolean;
  conversationFilter: 'all' | 'dm' | 'group';
  replyingTo: MessageItem | null;

  // Real-time tracking
  presenceByUserId: Record<string, PresenceStatus>;
  typingByConversationId: Record<string, { userId: string; displayName: string }[]>;

  // Actions
  setConversationFilter: (filter: 'all' | 'dm' | 'group') => void;
  toggleDetails: () => void;
  setDetailsOpen: (open: boolean) => void;
  setReplyingTo: (message: MessageItem | null) => void;
  fetchConversations: (filter?: 'all' | 'dm' | 'group') => Promise<void>;
  selectConversation: (id: string | null) => Promise<void>;
  fetchOlderMessages: (conversationId: string) => Promise<void>;
  sendMessage: (conversationId: string, content: string, replyToId?: string) => Promise<void>;
  retryMessage: (conversationId: string, clientMessageId: string) => Promise<void>;
  editMessage: (messageId: string, content: string) => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;
  toggleReaction: (messageId: string, emoji: string) => Promise<void>;
  markAsRead: (conversationId: string) => Promise<void>;
  emitTyping: (conversationId: string, isTyping: boolean) => void;
  initSocketListeners: () => void;
  resetChatState: () => void;
  getTotalUnreadCount: () => number;
}

// Module-level map to track auto-clearing typing timeouts (4s)
const typingTimeoutMap = new Map<string, NodeJS.Timeout>();

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  activeConversationId: null,
  activeConversationDetail: null,
  messagesByConversationId: {},
  hasMoreByConversationId: {},
  nextCursorByConversationId: {},
  isLoadingConversations: false,
  isLoadingMessages: false,
  isLoadingMoreMessages: false,
  isDetailsOpen: false,
  conversationFilter: 'all',
  replyingTo: null,
  presenceByUserId: {},
  typingByConversationId: {},

  setConversationFilter: (filter) => {
    set({ conversationFilter: filter });
    get().fetchConversations(filter);
  },

  toggleDetails: () => set((state) => ({ isDetailsOpen: !state.isDetailsOpen })),
  setDetailsOpen: (open) => set({ isDetailsOpen: open }),
  setReplyingTo: (message) => set({ replyingTo: message }),

  fetchConversations: async (filter) => {
    const activeFilter = filter || get().conversationFilter;
    set({ isLoadingConversations: true });
    try {
      const items = await api.getConversations(activeFilter);
      const newPresence = { ...get().presenceByUserId };

      // Populate presence from member lists
      items.forEach((conv) => {
        conv.members.forEach((m) => {
          if (m.presence) {
            newPresence[m.userId] = m.presence;
          }
        });
      });

      set({
        conversations: items,
        presenceByUserId: newPresence,
        isLoadingConversations: false,
      });
    } catch {
      set({ isLoadingConversations: false });
    }
  },

  selectConversation: async (id) => {
    if (!id) {
      set({
        activeConversationId: null,
        activeConversationDetail: null,
        replyingTo: null,
      });
      return;
    }

    set({
      activeConversationId: id,
      isLoadingMessages: true,
      replyingTo: null,
    });

    const socket = getSocket();
    if (socket && socket.connected) {
      socket.emit(SocketEvents.CONVERSATION_JOIN, { conversationId: id });
    }

    try {
      const [detail, messagesRes] = await Promise.all([
        api.getConversation(id),
        api.getMessages(id, undefined, 50),
      ]);

      const newPresence = { ...get().presenceByUserId };
      detail.members.forEach((m) => {
        if (m.presence) {
          newPresence[m.userId] = m.presence;
        }
      });

      set((state) => ({
        activeConversationDetail: detail,
        messagesByConversationId: {
          ...state.messagesByConversationId,
          [id]: messagesRes.data,
        },
        hasMoreByConversationId: {
          ...state.hasMoreByConversationId,
          [id]: messagesRes.meta.hasMore,
        },
        nextCursorByConversationId: {
          ...state.nextCursorByConversationId,
          [id]: messagesRes.meta.nextCursor,
        },
        presenceByUserId: newPresence,
        isLoadingMessages: false,
      }));

      // Mark conversation read
      await get().markAsRead(id);
    } catch {
      set({ isLoadingMessages: false });
    }
  },

  fetchOlderMessages: async (conversationId) => {
    const { hasMoreByConversationId, nextCursorByConversationId, isLoadingMoreMessages } = get();
    if (isLoadingMoreMessages || !hasMoreByConversationId[conversationId]) {
      return;
    }

    const cursor = nextCursorByConversationId[conversationId];
    if (!cursor) return;

    set({ isLoadingMoreMessages: true });
    try {
      const res = await api.getMessages(conversationId, cursor, 50);
      set((state) => {
        const existing = state.messagesByConversationId[conversationId] || [];
        const existingIds = new Set(existing.map((m) => m.id));
        const newOlder = res.data.filter((m) => !existingIds.has(m.id));

        return {
          messagesByConversationId: {
            ...state.messagesByConversationId,
            [conversationId]: [...newOlder, ...existing],
          },
          hasMoreByConversationId: {
            ...state.hasMoreByConversationId,
            [conversationId]: res.meta.hasMore,
          },
          nextCursorByConversationId: {
            ...state.nextCursorByConversationId,
            [conversationId]: res.meta.nextCursor,
          },
          isLoadingMoreMessages: false,
        };
      });
    } catch {
      set({ isLoadingMoreMessages: false });
    }
  },

  sendMessage: async (conversationId, content, replyToId) => {
    const authUser = useAuthStore.getState().user;
    const authProfile = useAuthStore.getState().profile;
    if (!authUser) return;

    const clientMessageId = crypto.randomUUID();
    const optimisticMessage: MessageItem = {
      id: clientMessageId,
      conversationId,
      senderId: authUser.id,
      sender: {
        id: authUser.id,
        username: authUser.username,
        displayName: authProfile?.displayName || authUser.username,
        avatarUrl: authProfile?.avatarUrl || null,
      },
      clientMessageId,
      content,
      type: 'TEXT',
      isEncrypted: false,
      replyToId: replyToId || null,
      replyTo: get().replyingTo
        ? {
            id: get().replyingTo!.id,
            content: get().replyingTo!.content,
            senderId: get().replyingTo!.senderId,
            senderName:
              get().replyingTo!.sender.displayName ||
              get().replyingTo!.sender.username,
          }
        : null,
      reactions: [],
      editedAt: null,
      deletedAt: null,
      createdAt: new Date().toISOString(),
      status: 'SENDING',
    };

    // Optimistically insert
    set((state) => {
      const existing = state.messagesByConversationId[conversationId] || [];
      return {
        replyingTo: null,
        messagesByConversationId: {
          ...state.messagesByConversationId,
          [conversationId]: [...existing, optimisticMessage],
        },
      };
    });

    const socket = getSocket();
    if (socket && socket.connected) {
      socket.emit(
        SocketEvents.MESSAGE_SEND,
        {
          conversationId,
          clientMessageId,
          content,
          replyToId,
        },
        (ack: { ok: boolean; message?: MessageItem; error?: string }) => {
          if (ack && ack.ok && ack.message) {
            const serverMsg = ack.message;
            set((state) => {
              const msgs = (state.messagesByConversationId[conversationId] || []).map((m) =>
                m.clientMessageId === clientMessageId || m.id === clientMessageId ? serverMsg : m,
              );

              // Update lastMessage in conversations
              const updatedConvs = state.conversations.map((c) =>
                c.id === conversationId
                  ? {
                      ...c,
                      lastMessage: {
                        id: serverMsg.id,
                        content: serverMsg.content,
                        senderId: serverMsg.senderId,
                        senderName:
                          serverMsg.sender.displayName || serverMsg.sender.username,
                        createdAt: serverMsg.createdAt,
                      },
                      lastMessageAt: serverMsg.createdAt,
                    }
                  : c,
              );
              // Re-sort by lastMessageAt DESC
              updatedConvs.sort(
                (a, b) =>
                  new Date(b.lastMessageAt || 0).getTime() -
                  new Date(a.lastMessageAt || 0).getTime(),
              );

              return {
                messagesByConversationId: {
                  ...state.messagesByConversationId,
                  [conversationId]: msgs,
                },
                conversations: updatedConvs,
              };
            });
          } else {
            // Mark FAILED
            set((state) => {
              const msgs = (state.messagesByConversationId[conversationId] || []).map((m) =>
                m.clientMessageId === clientMessageId || m.id === clientMessageId
                  ? { ...m, status: 'FAILED' as const }
                  : m,
              );
              return {
                messagesByConversationId: {
                  ...state.messagesByConversationId,
                  [conversationId]: msgs,
                },
              };
            });
          }
        },
      );
    } else {
      // Fallback to REST API
      try {
        const saved = await api.sendMessage(conversationId, {
          clientMessageId,
          content,
          replyToId,
        });

        set((state) => {
          const msgs = (state.messagesByConversationId[conversationId] || []).map((m) =>
            m.clientMessageId === clientMessageId || m.id === clientMessageId ? saved : m,
          );

          const updatedConvs = state.conversations.map((c) =>
            c.id === conversationId
              ? {
                  ...c,
                  lastMessage: {
                    id: saved.id,
                    content: saved.content,
                    senderId: saved.senderId,
                    senderName:
                      saved.sender.displayName || saved.sender.username,
                    createdAt: saved.createdAt,
                  },
                  lastMessageAt: saved.createdAt,
                }
              : c,
          );
          updatedConvs.sort(
            (a, b) =>
              new Date(b.lastMessageAt || 0).getTime() -
              new Date(a.lastMessageAt || 0).getTime(),
          );

          return {
            messagesByConversationId: {
              ...state.messagesByConversationId,
              [conversationId]: msgs,
            },
            conversations: updatedConvs,
          };
        });
      } catch {
        set((state) => {
          const msgs = (state.messagesByConversationId[conversationId] || []).map((m) =>
            m.clientMessageId === clientMessageId || m.id === clientMessageId
              ? { ...m, status: 'FAILED' as const }
              : m,
          );
          return {
            messagesByConversationId: {
              ...state.messagesByConversationId,
              [conversationId]: msgs,
            },
          };
        });
      }
    }
  },

  retryMessage: async (conversationId, clientMessageId) => {
    const msg = (get().messagesByConversationId[conversationId] || []).find(
      (m) => m.clientMessageId === clientMessageId || m.id === clientMessageId,
    );
    if (!msg) return;

    // Set to SENDING
    set((state) => {
      const msgs = (state.messagesByConversationId[conversationId] || []).map((m) =>
        m.clientMessageId === clientMessageId || m.id === clientMessageId
          ? { ...m, status: 'SENDING' as const }
          : m,
      );
      return {
        messagesByConversationId: {
          ...state.messagesByConversationId,
          [conversationId]: msgs,
        },
      };
    });

    const socket = getSocket();
    if (socket && socket.connected) {
      socket.emit(
        SocketEvents.MESSAGE_SEND,
        {
          conversationId,
          clientMessageId: msg.clientMessageId,
          content: msg.content,
          replyToId: msg.replyToId || undefined,
        },
        (ack: { ok: boolean; message?: MessageItem }) => {
          if (ack && ack.ok && ack.message) {
            set((state) => {
              const msgs = (state.messagesByConversationId[conversationId] || []).map((m) =>
                m.clientMessageId === clientMessageId || m.id === clientMessageId
                  ? ack.message!
                  : m,
              );
              return {
                messagesByConversationId: {
                  ...state.messagesByConversationId,
                  [conversationId]: msgs,
                },
              };
            });
          } else {
            set((state) => {
              const msgs = (state.messagesByConversationId[conversationId] || []).map((m) =>
                m.clientMessageId === clientMessageId || m.id === clientMessageId
                  ? { ...m, status: 'FAILED' as const }
                  : m,
              );
              return {
                messagesByConversationId: {
                  ...state.messagesByConversationId,
                  [conversationId]: msgs,
                },
              };
            });
          }
        },
      );
    }
  },

  editMessage: async (messageId, content) => {
    try {
      const updated = await api.editMessage(messageId, content);
      set((state) => {
        const conversationId = updated.conversationId;
        const msgs = (state.messagesByConversationId[conversationId] || []).map((m) =>
          m.id === messageId ? updated : m,
        );
        return {
          messagesByConversationId: {
            ...state.messagesByConversationId,
            [conversationId]: msgs,
          },
        };
      });
    } catch (err) {
      throw err;
    }
  },

  deleteMessage: async (messageId) => {
    try {
      const deleted = await api.deleteMessage(messageId);
      set((state) => {
        const conversationId = deleted.conversationId;
        const msgs = (state.messagesByConversationId[conversationId] || []).map((m) =>
          m.id === messageId ? deleted : m,
        );
        return {
          messagesByConversationId: {
            ...state.messagesByConversationId,
            [conversationId]: msgs,
          },
        };
      });
    } catch (err) {
      throw err;
    }
  },

  toggleReaction: async (messageId, emoji) => {
    const authUser = useAuthStore.getState().user;
    if (!authUser) return;

    // Find message
    let targetMsg: MessageItem | undefined;
    let targetConvId = '';
    const state = get();

    for (const [convId, list] of Object.entries(state.messagesByConversationId)) {
      const found = list.find((m) => m.id === messageId);
      if (found) {
        targetMsg = found;
        targetConvId = convId;
        break;
      }
    }

    if (!targetMsg) return;

    const hasReacted = targetMsg.reactions.some(
      (r) => r.userIds.includes(authUser.id) && r.emoji === emoji,
    );

    try {
      if (hasReacted) {
        const res = await api.removeReaction(messageId, emoji);
        set((s) => {
          const msgs = (s.messagesByConversationId[targetConvId] || []).map((m) =>
            m.id === messageId ? { ...m, reactions: res.reactions } : m,
          );
          return {
            messagesByConversationId: {
              ...s.messagesByConversationId,
              [targetConvId]: msgs,
            },
          };
        });
      } else {
        const res = await api.addReaction(messageId, emoji);
        set((s) => {
          const msgs = (s.messagesByConversationId[targetConvId] || []).map((m) =>
            m.id === messageId ? { ...m, reactions: res.reactions } : m,
          );
          return {
            messagesByConversationId: {
              ...s.messagesByConversationId,
              [targetConvId]: msgs,
            },
          };
        });
      }
    } catch (err) {
      throw err;
    }
  },

  markAsRead: async (conversationId) => {
    const messages = get().messagesByConversationId[conversationId] || [];
    const latest = messages[messages.length - 1];

    try {
      await api.markConversationRead(conversationId, latest?.id);
      const socket = getSocket();
      if (socket && socket.connected && latest) {
        socket.emit(SocketEvents.MESSAGE_READ, {
          conversationId,
          lastReadMessageId: latest.id,
        });
      }

      set((state) => ({
        conversations: state.conversations.map((c) =>
          c.id === conversationId ? { ...c, unreadCount: 0 } : c,
        ),
      }));
    } catch {
      // Non-critical, ignore
    }
  },

  emitTyping: (conversationId, isTyping) => {
    const socket = getSocket();
    if (!socket || !socket.connected) return;

    if (isTyping) {
      socket.emit(SocketEvents.TYPING_START, { conversationId });
    } else {
      socket.emit(SocketEvents.TYPING_STOP, { conversationId });
    }
  },

  initSocketListeners: () => {
    const socket = getSocket();
    if (!socket) return;

    // Clean existing listeners to avoid duplicate bindings
    socket.off(SocketEvents.MESSAGE_NEW);
    socket.off(SocketEvents.MESSAGE_STATUS);
    socket.off(SocketEvents.MESSAGE_UPDATED);
    socket.off(SocketEvents.MESSAGE_DELETED);
    socket.off(SocketEvents.MESSAGE_REACTION);
    socket.off(SocketEvents.TYPING_UPDATE);
    socket.off(SocketEvents.PRESENCE_CHANGED);
    socket.off(SocketEvents.CONVERSATION_UPDATED);
    socket.off('reconnect');

    // 1. New Message Event
    socket.on(SocketEvents.MESSAGE_NEW, (payload: { message: MessageItem }) => {
      const msg = payload.message;
      const currentUserId = useAuthStore.getState().user?.id;
      const isMyMessage = msg.senderId === currentUserId;
      const { activeConversationId } = get();

      set((state) => {
        const convId = msg.conversationId;
        const existingList = state.messagesByConversationId[convId] || [];

        // Deduplicate strictly by id OR clientMessageId
        const matchIdx = existingList.findIndex(
          (m) =>
            m.id === msg.id ||
            (msg.clientMessageId && m.clientMessageId === msg.clientMessageId),
        );

        let updatedList: MessageItem[];
        if (matchIdx >= 0) {
          updatedList = [...existingList];
          updatedList[matchIdx] = msg;
        } else {
          updatedList = [...existingList, msg];
        }

        // Update conversation summary & unread count
        const updatedConvs = state.conversations.map((c) => {
          if (c.id === convId) {
            const isCurrentChat = activeConversationId === convId;
            return {
              ...c,
              lastMessage: {
                id: msg.id,
                content: msg.content,
                senderId: msg.senderId,
                senderName:
                  msg.sender.displayName || msg.sender.username,
                createdAt: msg.createdAt,
              },
              lastMessageAt: msg.createdAt,
              // Never increment unread for own messages or active chat
              unreadCount:
                isMyMessage || isCurrentChat ? c.unreadCount : c.unreadCount + 1,
            };
          }
          return c;
        });

        // Re-sort conversations newest-first
        updatedConvs.sort(
          (a, b) =>
            new Date(b.lastMessageAt || 0).getTime() -
            new Date(a.lastMessageAt || 0).getTime(),
        );

        return {
          messagesByConversationId: {
            ...state.messagesByConversationId,
            [convId]: updatedList,
          },
          conversations: updatedConvs,
        };
      });

      // Adjustment 3: Skip delivered & markRead for own messages
      if (!isMyMessage) {
        socket.emit(SocketEvents.MESSAGE_DELIVERED, {
          conversationId: msg.conversationId,
          messageId: msg.id,
        });

        if (activeConversationId === msg.conversationId) {
          get().markAsRead(msg.conversationId);
        }
      }
    });

    // 2. Message Status (Receipts)
    socket.on(SocketEvents.MESSAGE_STATUS, (payload: MessageStatusPayload) => {
      set((state) => {
        const convId = payload.conversationId;
        const list = state.messagesByConversationId[convId];
        if (!list) return state;

        const updated = list.map((m) =>
          m.id === payload.messageId
            ? { ...m, status: payload.status as 'DELIVERED' | 'READ' }
            : m,
        );

        return {
          messagesByConversationId: {
            ...state.messagesByConversationId,
            [convId]: updated,
          },
        };
      });
    });

    // 3. Message Edited
    socket.on(SocketEvents.MESSAGE_UPDATED, (payload: MessageUpdatedPayload) => {
      set((state) => {
        const convId = payload.conversationId;
        const list = state.messagesByConversationId[convId];
        if (!list) return state;

        const updated = list.map((m) =>
          m.id === payload.messageId
            ? { ...m, content: payload.content, editedAt: payload.editedAt }
            : m,
        );

        return {
          messagesByConversationId: {
            ...state.messagesByConversationId,
            [convId]: updated,
          },
        };
      });
    });

    // 4. Message Deleted (Soft delete)
    socket.on(SocketEvents.MESSAGE_DELETED, (payload: MessageDeletedPayload) => {
      set((state) => {
        const convId = payload.conversationId;
        const list = state.messagesByConversationId[convId];
        if (!list) return state;

        const updated = list.map((m) =>
          m.id === payload.messageId
            ? { ...m, content: 'This message was deleted', deletedAt: payload.deletedAt }
            : m,
        );

        return {
          messagesByConversationId: {
            ...state.messagesByConversationId,
            [convId]: updated,
          },
        };
      });
    });

    // 5. Message Reaction
    socket.on(SocketEvents.MESSAGE_REACTION, (payload: MessageReactionPayload) => {
      set((state) => {
        const convId = payload.conversationId;
        const list = state.messagesByConversationId[convId];
        if (!list) return state;

        const updated = list.map((m) =>
          m.id === payload.messageId ? { ...m, reactions: payload.reactions } : m,
        );

        return {
          messagesByConversationId: {
            ...state.messagesByConversationId,
            [convId]: updated,
          },
        };
      });
    });

    // 6. Typing Indicators (with 4s auto-clear)
    socket.on(SocketEvents.TYPING_UPDATE, (payload: TypingUpdatePayload) => {
      const currentUserId = useAuthStore.getState().user?.id;
      if (payload.userId === currentUserId) return;

      const convId = payload.conversationId;
      const key = `${convId}_${payload.userId}`;

      // Clear pending timeout for this user if exists
      const existingTimeout = typingTimeoutMap.get(key);
      if (existingTimeout) {
        clearTimeout(existingTimeout);
        typingTimeoutMap.delete(key);
      }

      set((state) => {
        const currentTypers = state.typingByConversationId[convId] || [];
        let updatedTypers: { userId: string; displayName: string }[];

        if (payload.isTyping) {
          const exists = currentTypers.some((t) => t.userId === payload.userId);
          updatedTypers = exists
            ? currentTypers
            : [...currentTypers, { userId: payload.userId, displayName: payload.displayName }];
        } else {
          updatedTypers = currentTypers.filter((t) => t.userId !== payload.userId);
        }

        return {
          typingByConversationId: {
            ...state.typingByConversationId,
            [convId]: updatedTypers,
          },
        };
      });

      // If typing: true, start 4-second safety auto-clear timer
      if (payload.isTyping) {
        const timer = setTimeout(() => {
          typingTimeoutMap.delete(key);
          set((state) => ({
            typingByConversationId: {
              ...state.typingByConversationId,
              [convId]: (state.typingByConversationId[convId] || []).filter(
                (t) => t.userId !== payload.userId,
              ),
            },
          }));
        }, 4000);
        typingTimeoutMap.set(key, timer);
      }
    });

    // 7. Live Redis Presence
    socket.on(SocketEvents.PRESENCE_CHANGED, (payload: PresenceChangedPayload) => {
      set((state) => ({
        presenceByUserId: {
          ...state.presenceByUserId,
          [payload.userId]: payload.status,
        },
      }));
    });

    // 8. Conversation Updated (New DM/Group created or renamed)
    socket.on(
      SocketEvents.CONVERSATION_UPDATED,
      (payload: ConversationUpdatedPayload) => {
        set((state) => {
          const exists = state.conversations.some((c) => c.id === payload.conversation.id);
          const updated = exists
            ? state.conversations.map((c) =>
                c.id === payload.conversation.id ? payload.conversation : c,
              )
            : [payload.conversation, ...state.conversations];

          updated.sort(
            (a, b) =>
              new Date(b.lastMessageAt || 0).getTime() -
              new Date(a.lastMessageAt || 0).getTime(),
          );

          return { conversations: updated };
        });
      },
    );

    // 9. Reconnect Catch-Up
    socket.on('reconnect', async () => {
      // Re-fetch conversations
      await get().fetchConversations();

      // If viewing active chat, re-join room and fetch latest messages
      const activeId = get().activeConversationId;
      if (activeId) {
        socket.emit(SocketEvents.CONVERSATION_JOIN, { conversationId: activeId });
        try {
          const res = await api.getMessages(activeId, undefined, 50);
          set((state) => {
            const existing = state.messagesByConversationId[activeId] || [];
            const existingMap = new Map(existing.map((m) => [m.id, m]));
            res.data.forEach((m) => existingMap.set(m.id, m));
            const merged = Array.from(existingMap.values()).sort(
              (a, b) =>
                new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
            );

            return {
              messagesByConversationId: {
                ...state.messagesByConversationId,
                [activeId]: merged,
              },
            };
          });
        } catch {
          // Ignore
        }
      }
    });
  },

  resetChatState: () => {
    typingTimeoutMap.forEach((t) => clearTimeout(t));
    typingTimeoutMap.clear();
    set({
      conversations: [],
      activeConversationId: null,
      activeConversationDetail: null,
      messagesByConversationId: {},
      hasMoreByConversationId: {},
      nextCursorByConversationId: {},
      isLoadingConversations: false,
      isLoadingMessages: false,
      isLoadingMoreMessages: false,
      isDetailsOpen: false,
      conversationFilter: 'all',
      replyingTo: null,
      presenceByUserId: {},
      typingByConversationId: {},
    });
  },

  getTotalUnreadCount: () => {
    return get().conversations.reduce((acc, c) => acc + (c.unreadCount || 0), 0);
  },
}));
