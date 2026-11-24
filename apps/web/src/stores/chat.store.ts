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
import {
  encryptForConversation,
  decryptMessageContent,
} from '../lib/e2eeManager';

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
  sendMessage: (
    conversationId: string,
    content: string,
    replyToId?: string,
    attachmentIds?: string[],
    stagedAttachments?: any[],
  ) => Promise<void>;
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
      const currentUserId = useAuthStore.getState().user?.id;
      const newPresence = { ...get().presenceByUserId };

      // Populate presence from member lists
      items.forEach((conv) => {
        conv.members.forEach((m) => {
          if (m.presence) {
            newPresence[m.userId] = m.presence;
          }
        });
      });

      // User adjustment #2: Decrypt lastMessage for conversation previews
      const decryptedItems = await Promise.all(
        items.map(async (conv) => {
          if (conv.lastMessage && conv.lastMessage.content && currentUserId) {
            const isEncrypted = conv.isEncrypted;
            // If the conversation is encrypted, decrypt or provide fallback
            if (isEncrypted) {
              const decryptedPreview = await decryptMessageContent(
                {
                  id: conv.lastMessage.id,
                  conversationId: conv.id,
                  senderId: conv.lastMessage.senderId,
                  content: conv.lastMessage.content,
                  isEncrypted: true,
                  e2eeHeader: (conv.lastMessage as any).e2eeHeader,
                  clientMessageId: '',
                  type: 'TEXT',
                  replyToId: null,
                  editedAt: null,
                  deletedAt: null,
                  createdAt: conv.lastMessage.createdAt,
                  sender: {
                    id: conv.lastMessage.senderId,
                    username: conv.lastMessage.senderName,
                    displayName: conv.lastMessage.senderName,
                    avatarUrl: null,
                  },
                  reactions: [],
                },
                currentUserId,
              );
              return {
                ...conv,
                lastMessage: {
                  ...conv.lastMessage,
                  content: decryptedPreview,
                },
              };
            }
          }
          return conv;
        }),
      );

      set({
        conversations: decryptedItems,
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

      const currentUserId = useAuthStore.getState().user?.id;
      const newPresence = { ...get().presenceByUserId };
      detail.members.forEach((m) => {
        if (m.presence) {
          newPresence[m.userId] = m.presence;
        }
      });

      // Decrypt message batch if current user exists
      const decryptedMessages = currentUserId
        ? await Promise.all(
            messagesRes.data.map(async (m) => {
              if (m.isEncrypted) {
                const plaintext = await decryptMessageContent(m, currentUserId);
                return { ...m, content: plaintext };
              }
              return m;
            }),
          )
        : messagesRes.data;

      set((state) => ({
        activeConversationDetail: detail,
        messagesByConversationId: {
          ...state.messagesByConversationId,
          [id]: decryptedMessages,
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
      const currentUserId = useAuthStore.getState().user?.id;

      const decryptedMessages = currentUserId
        ? await Promise.all(
            res.data.map(async (m) => {
              if (m.isEncrypted) {
                const plaintext = await decryptMessageContent(m, currentUserId);
                return { ...m, content: plaintext };
              }
              return m;
            }),
          )
        : res.data;

      set((state) => {
        const existing = state.messagesByConversationId[conversationId] || [];
        const existingIds = new Set(existing.map((m) => m.id));
        const newOlder = decryptedMessages.filter((m) => !existingIds.has(m.id));

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

  sendMessage: async (
    conversationId,
    content,
    replyToId,
    attachmentIds,
    stagedAttachments,
  ) => {
    const authUser = useAuthStore.getState().user;
    const authProfile = useAuthStore.getState().profile;
    if (!authUser) return;

    // Check if conversation is encrypted
    const targetConv =
      (get().activeConversationDetail?.id === conversationId ? get().activeConversationDetail : null) ||
      get().conversations.find((c) => c.id === conversationId);

    const isEncrypted = Boolean(targetConv?.isEncrypted);
    let ciphertextPayload = content;
    let senderDeviceId: string | undefined;
    let e2eeHeader: any | undefined;

    if (isEncrypted) {
      try {
        // Find recipient user ID in DM
        const otherMember = targetConv?.members.find((m) => m.userId !== authUser.id);
        if (!otherMember) {
          throw new Error('Could not identify recipient for encrypted message');
        }

        const encryptedResult = await encryptForConversation(
          conversationId,
          otherMember.userId,
          authUser.id,
          content,
        );

        ciphertextPayload = encryptedResult.ciphertext;
        senderDeviceId = encryptedResult.senderDeviceId;
        e2eeHeader = encryptedResult.e2eeHeader;
      } catch (err: any) {
        console.error('[E2EE] Message encryption failed:', err);
        throw err;
      }
    }

    let inferredType: any = 'TEXT';
    if (stagedAttachments && stagedAttachments.length > 0) {
      const mime = stagedAttachments[0].mimeType || '';
      if (mime.startsWith('image/')) inferredType = 'IMAGE';
      else if (mime.startsWith('video/')) inferredType = 'VIDEO';
      else if (mime.startsWith('audio/')) inferredType = 'AUDIO';
      else inferredType = 'FILE';
    }

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
      content, // User adjustment #2: Always keep plaintext content in optimistic message so bubble doesn't flash ciphertext
      type: inferredType,
      attachments: stagedAttachments || [],
      isEncrypted,
      senderDeviceId,
      e2eeHeader,
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

    const sendPayload: any = {
      conversationId,
      clientMessageId,
      content: ciphertextPayload,
      replyToId,
      isEncrypted,
      senderDeviceId,
      e2eeHeader,
    };

    if (attachmentIds && attachmentIds.length > 0) {
      sendPayload.attachmentIds = attachmentIds;
    }

    const socket = getSocket();
    if (socket && socket.connected) {
      socket.emit(
        SocketEvents.MESSAGE_SEND,
        sendPayload,
        (ack: { ok: boolean; message?: MessageItem; error?: string }) => {
          if (ack && ack.ok && ack.message) {
            // User adjustment #2: Preserve plaintext content in state message
            const serverMsg: MessageItem = {
              ...ack.message,
              content, // Keep decrypted plaintext for caller
            };

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
                        content, // Plaintext preview
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
        const savedRaw = await api.sendMessage(conversationId, {
          clientMessageId,
          content: ciphertextPayload,
          replyToId,
          isEncrypted,
          senderDeviceId,
          e2eeHeader,
        });

        const saved: MessageItem = {
          ...savedRaw,
          content,
        };

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
                    content,
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

    const authUser = useAuthStore.getState().user;
    if (!authUser) return;

    // Check if conversation is encrypted
    const targetConv =
      (get().activeConversationDetail?.id === conversationId ? get().activeConversationDetail : null) ||
      get().conversations.find((c) => c.id === conversationId);

    const isEncrypted = Boolean(targetConv?.isEncrypted);
    let ciphertextPayload = msg.content;
    let senderDeviceId = msg.senderDeviceId;
    let e2eeHeader = msg.e2eeHeader;

    if (isEncrypted) {
      try {
        const otherMember = targetConv?.members.find((m) => m.userId !== authUser.id);
        if (otherMember) {
          const encryptedResult = await encryptForConversation(
            conversationId,
            otherMember.userId,
            authUser.id,
            msg.content, // msg.content holds the plaintext in store
          );
          ciphertextPayload = encryptedResult.ciphertext;
          senderDeviceId = encryptedResult.senderDeviceId;
          e2eeHeader = encryptedResult.e2eeHeader;
        }
      } catch (err) {
        console.error('[E2EE] Retry encryption failed:', err);
      }
    }

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
          content: ciphertextPayload,
          replyToId: msg.replyToId || undefined,
          isEncrypted,
          senderDeviceId,
          e2eeHeader,
        },
        (ack: { ok: boolean; message?: MessageItem }) => {
          if (ack && ack.ok && ack.message) {
            const preservedMsg: MessageItem = {
              ...ack.message,
              content: msg.content, // preserve plaintext
            };
            set((state) => {
              const msgs = (state.messagesByConversationId[conversationId] || []).map((m) =>
                m.clientMessageId === clientMessageId || m.id === clientMessageId
                  ? preservedMsg
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
    const authUser = useAuthStore.getState().user;
    if (!authUser) return;

    // Find message to check encryption
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

    const targetConv =
      (state.activeConversationDetail?.id === targetConvId ? state.activeConversationDetail : null) ||
      state.conversations.find((c) => c.id === targetConvId);

    const isEncrypted = Boolean(targetConv?.isEncrypted);
    let ciphertext = content;
    let senderDeviceId: string | undefined;
    let e2eeHeader: any | undefined;

    if (isEncrypted && targetConv) {
      const otherMember = targetConv.members.find((m) => m.userId !== authUser.id);
      if (otherMember) {
        const encryptedResult = await encryptForConversation(
          targetConvId,
          otherMember.userId,
          authUser.id,
          content,
        );
        ciphertext = encryptedResult.ciphertext;
        senderDeviceId = encryptedResult.senderDeviceId;
        e2eeHeader = encryptedResult.e2eeHeader;
      }
    }

    try {
      const updatedRaw = await api.editMessage(messageId, ciphertext);
      const updated: MessageItem = {
        ...updatedRaw,
        content, // Preserve decrypted plaintext locally
      };

      set((s) => {
        const conversationId = updated.conversationId;
        const msgs = (s.messagesByConversationId[conversationId] || []).map((m) =>
          m.id === messageId ? updated : m,
        );
        return {
          messagesByConversationId: {
            ...s.messagesByConversationId,
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
    socket.on(SocketEvents.MESSAGE_NEW, async (payload: { message: MessageItem }) => {
      let msg = payload.message;
      const currentUserId = useAuthStore.getState().user?.id;
      const isMyMessage = msg.senderId === currentUserId;
      const { activeConversationId } = get();

      // User adjustment #2: If incoming message is encrypted, decrypt client-side immediately
      if (msg.isEncrypted && currentUserId) {
        if (!isMyMessage) {
          const decrypted = await decryptMessageContent(msg, currentUserId);
          msg = { ...msg, content: decrypted };
        } else {
          // If own message echoed back from server with ciphertext, keep existing plaintext if already in store
          const existing = (get().messagesByConversationId[msg.conversationId] || []).find(
            (m) => m.clientMessageId === msg.clientMessageId || m.id === msg.id,
          );
          if (existing && existing.content && !existing.content.startsWith('ey')) {
            msg = { ...msg, content: existing.content };
          } else {
            const decrypted = await decryptMessageContent(msg, currentUserId);
            msg = { ...msg, content: decrypted };
          }
        }
      }

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
    socket.on(SocketEvents.MESSAGE_UPDATED, async (payload: MessageUpdatedPayload) => {
      const currentUserId = useAuthStore.getState().user?.id;
      let displayContent = payload.content;

      // If message is encrypted, decrypt updated content
      if (payload.e2eeHeader && currentUserId) {
        displayContent = await decryptMessageContent(
          {
            id: payload.messageId,
            conversationId: payload.conversationId,
            senderId: '',
            content: payload.content,
            isEncrypted: true,
            e2eeHeader: payload.e2eeHeader,
            senderDeviceId: payload.senderDeviceId,
            clientMessageId: '',
            type: 'TEXT',
            replyToId: null,
            editedAt: payload.editedAt,
            deletedAt: null,
            createdAt: payload.editedAt,
            sender: { id: '', username: '', displayName: '', avatarUrl: null },
            reactions: [],
          },
          currentUserId,
        );
      }

      set((state) => {
        const convId = payload.conversationId;
        const list = state.messagesByConversationId[convId];
        if (!list) return state;

        const updated = list.map((m) =>
          m.id === payload.messageId
            ? { ...m, content: displayContent, editedAt: payload.editedAt, e2eeHeader: payload.e2eeHeader }
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

    // 8. Conversation Updated (New DM/Group created or renamed or E2EE enabled)
    socket.on(
      SocketEvents.CONVERSATION_UPDATED,
      (payload: ConversationUpdatedPayload | any) => {
        set((state) => {
          const conv = payload.conversation || payload;
          const exists = state.conversations.some((c) => c.id === conv.id);
          const updated = exists
            ? state.conversations.map((c) =>
                c.id === conv.id ? { ...c, ...conv } : c,
              )
            : [conv, ...state.conversations];

          updated.sort(
            (a, b) =>
              new Date(b.lastMessageAt || 0).getTime() -
              new Date(a.lastMessageAt || 0).getTime(),
          );

          const activeDetail =
            state.activeConversationDetail && state.activeConversationDetail.id === conv.id
              ? { ...state.activeConversationDetail, ...conv }
              : state.activeConversationDetail;

          return { conversations: updated, activeConversationDetail: activeDetail };
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
