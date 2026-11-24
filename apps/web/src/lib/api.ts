import {
  RegisterDto,
  LoginDto,
  AuthResponse,
  RefreshResponse,
  AuthMeResponse,
  UpdateProfileDto,
  UpdateUserSettingsDto,
  PublicProfileResponse,
  UserProfile,
  UserSettings,
  ConversationItem,
  ConversationDetail,
  CreateDmDto,
  CreateGroupDto,
  UpdateConversationDto,
  AddMembersDto,
  MarkConversationReadDto,
  MessageItem,
  SendMessageDto,
  EditMessageDto,
  CursorPaginationMeta,
  MessageReactionItem,
  RegisterDeviceDto,
  ReplenishPreKeysDto,
  DeviceSummary,
  UserKeyBundleResponse,
  PresignUploadInput,
  PresignUploadResponse,
  MediaAttachmentItem,
  MediaDownloadUrlResponse,
  NotificationItem,
  PaginatedNotificationsResponse,
  CommunityItem,
  CommunityDetail,
  CommunityMemberItem,
  ChannelItem,
  ChannelMessageItem,
  CommunityInviteItem,
  CreateCommunityDto,
  UpdateCommunityDto,
  CreateInviteDto,
  UpdateMemberRoleDto,
  CreateChannelDto,
  UpdateChannelDto,
  SendChannelMessageDto,
  EditChannelMessageDto,
  FollowUserSummary,
  PostItem,
  PostCommentItem,
  StoryItem,
  AuthorStoriesGroup,
  StoryViewerItem,
  CreatePostDto,
  CreateCommentDto,
  CreateStoryDto,
  IceServersResponse,
  PaginatedCallsResponse,
} from '@chatterbox/shared';
import { updateSocketToken } from './socket';

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

// In-memory access token storage — never localStorage
let memoryAccessToken: string | null = null;

// Module-level single-flight refresh promise to guarantee strict mode safety
let refreshPromise: Promise<string | null> | null = null;

// Failed request queue for concurrent 401 retry
interface QueuedRequest {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
  execute: () => Promise<unknown>;
}
let failedQueue: QueuedRequest[] = [];

function processQueue(error: Error | null) {
  failedQueue.forEach((req) => {
    if (error) {
      req.reject(error);
    } else {
      req.execute().then(req.resolve).catch(req.reject);
    }
  });
  failedQueue = [];
}

export function setAccessToken(token: string | null) {
  memoryAccessToken = token;
  updateSocketToken(token);
}

export function getAccessToken(): string | null {
  return memoryAccessToken;
}

export class ApiError extends Error {
  code: string;
  details?: unknown[];

  constructor(message: string, code: string, details?: unknown[]) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.details = details;
  }
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (res.status === 204) {
    return undefined as unknown as T;
  }

  const json = await res.json().catch(() => null);

  if (!res.ok) {
    const error = json?.error;
    throw new ApiError(
      error?.message || `Request failed with status ${res.status}`,
      error?.code || 'API_ERROR',
      error?.details,
    );
  }

  return (json?.data !== undefined ? json.data : json) as T;
}

/**
 * Single-flight deduplicated token refresh function
 */
export async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include', // transmits HttpOnly refresh cookie
      });

      if (!res.ok) {
        setAccessToken(null);
        return null;
      }

      const json = await res.json();
      const token = json?.data?.accessToken || json?.accessToken;
      if (token) {
        setAccessToken(token);
        processQueue(null);
        return token;
      }

      setAccessToken(null);
      return null;
    } catch {
      setAccessToken(null);
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

/**
 * Core HTTP client with automatic 401 interception & request queuing
 */
export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
  isRetry = false,
): Promise<T> {
  const url = `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
  const headers = new Headers(options.headers || {});

  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  if (memoryAccessToken) {
    headers.set('Authorization', `Bearer ${memoryAccessToken}`);
  }

  const config: RequestInit = {
    ...options,
    headers,
    credentials: 'include', // always include cookies
  };

  try {
    const response = await fetch(url, config);

    // If 401 Unauthorized and not already retrying / auth route
    if (
      response.status === 401 &&
      !isRetry &&
      !path.includes('/auth/login') &&
      !path.includes('/auth/register') &&
      !path.includes('/auth/refresh')
    ) {
      // Queue this request and wait for single-flight refresh
      return new Promise<T>((resolve, reject) => {
        failedQueue.push({
          resolve: resolve as (value: unknown) => void,
          reject,
          execute: () => apiRequest<T>(path, options, true),
        });

        // Trigger refresh if not already pending
        refreshAccessToken().then((token) => {
          if (!token) {
            processQueue(new ApiError('Session expired. Please log in again.', 'UNAUTHORIZED'));
          }
        });
      });
    }

    return await handleResponse<T>(response);
  } catch (error) {
    throw error;
  }
}

// Concrete API Methods
export const api = {
  // Auth
  register: (dto: RegisterDto) =>
    apiRequest<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(dto),
    }),

  login: (dto: LoginDto) =>
    apiRequest<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(dto),
    }),

  logout: () =>
    apiRequest<void>('/auth/logout', {
      method: 'POST',
    }),

  refresh: refreshAccessToken,

  getMe: () => apiRequest<AuthMeResponse>('/auth/me'),

  // Profiles & Users
  getProfile: (username: string) =>
    apiRequest<PublicProfileResponse>(`/profiles/${encodeURIComponent(username)}`),

  updateProfile: (dto: UpdateProfileDto) =>
    apiRequest<UserProfile>('/profiles/me', {
      method: 'PATCH',
      body: JSON.stringify(dto),
    }),

  searchUsers: (query: string, limit = 20) =>
    apiRequest<
      Array<{
        id: string;
        username: string;
        displayName: string;
        avatarUrl: string | null;
        bio: string | null;
      }>
    >(`/users/search?q=${encodeURIComponent(query)}&limit=${limit}`),

  // Settings
  getSettings: () => apiRequest<UserSettings>('/settings/me'),

  updateSettings: (dto: UpdateUserSettingsDto) =>
    apiRequest<UserSettings>('/settings/me', {
      method: 'PATCH',
      body: JSON.stringify(dto),
    }),

  // Conversations (Phase 2)
  getConversations: (filter: 'all' | 'dm' | 'group' = 'all') =>
    apiRequest<ConversationItem[]>(`/conversations?filter=${filter}`),

  createDm: (targetUserId: string) =>
    apiRequest<ConversationItem>('/conversations/dm', {
      method: 'POST',
      body: JSON.stringify({ targetUserId }),
    }),

  createGroup: (name: string, memberIds: string[]) =>
    apiRequest<ConversationItem>('/conversations/group', {
      method: 'POST',
      body: JSON.stringify({ name, memberIds }),
    }),

  getConversation: (id: string) =>
    apiRequest<ConversationDetail>(`/conversations/${id}`),

  updateConversation: (id: string, dto: UpdateConversationDto) =>
    apiRequest<ConversationDetail>(`/conversations/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(dto),
    }),

  addGroupMembers: (id: string, userIds: string[]) =>
    apiRequest<ConversationDetail>(`/conversations/${id}/members`, {
      method: 'POST',
      body: JSON.stringify({ userIds }),
    }),

  removeGroupMember: (id: string, userId: string) =>
    apiRequest<void>(`/conversations/${id}/members/${userId}`, {
      method: 'DELETE',
    }),

  markConversationRead: (id: string, lastReadMessageId?: string) =>
    apiRequest<{ unreadCount: number }>(`/conversations/${id}/read`, {
      method: 'POST',
      body: JSON.stringify(lastReadMessageId ? { lastReadMessageId } : {}),
    }),

  // Messages (Phase 2)
  getMessages: (conversationId: string, cursor?: string, limit = 50) => {
    const query = cursor
      ? `?cursor=${encodeURIComponent(cursor)}&limit=${limit}`
      : `?limit=${limit}`;
    return apiRequest<{ data: MessageItem[]; meta: CursorPaginationMeta }>(
      `/conversations/${conversationId}/messages${query}`,
    );
  },

  sendMessage: (conversationId: string, dto: SendMessageDto) =>
    apiRequest<MessageItem>(`/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: JSON.stringify(dto),
    }),

  editMessage: (messageId: string, content: string) =>
    apiRequest<MessageItem>(`/messages/${messageId}`, {
      method: 'PATCH',
      body: JSON.stringify({ content }),
    }),

  deleteMessage: (messageId: string) =>
    apiRequest<MessageItem>(`/messages/${messageId}`, {
      method: 'DELETE',
    }),

  addReaction: (messageId: string, emoji: string) =>
    apiRequest<{ reactions: MessageReactionItem[] }>(
      `/messages/${messageId}/reactions`,
      {
        method: 'POST',
        body: JSON.stringify({ emoji }),
      },
    ),

  removeReaction: (messageId: string, emoji: string) =>
    apiRequest<{ reactions: MessageReactionItem[] }>(
      `/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`,
      {
        method: 'DELETE',
      },
    ),

  // Phase 3: E2EE & Device Encryption APIs
  registerDevice: (dto: RegisterDeviceDto) =>
    apiRequest<DeviceSummary>('/encryption/devices', {
      method: 'POST',
      body: JSON.stringify(dto),
    }),

  getMyDevices: () =>
    apiRequest<DeviceSummary[]>('/encryption/devices', {
      method: 'GET',
    }),

  revokeDevice: (deviceId: string) =>
    apiRequest<{ success: true }>(`/encryption/devices/${deviceId}`, {
      method: 'DELETE',
    }),

  replenishPreKeys: (deviceId: string, dto: ReplenishPreKeysDto) =>
    apiRequest<{ added: number }>(`/encryption/devices/${deviceId}/prekeys`, {
      method: 'POST',
      body: JSON.stringify(dto),
    }),

  getUserKeyBundles: (userId: string) =>
    apiRequest<UserKeyBundleResponse>(`/encryption/users/${userId}/keys`, {
      method: 'GET',
    }),

  enableConversationE2ee: (conversationId: string) =>
    apiRequest<{ success: boolean; conversationId: string; isEncrypted: boolean }>(
      `/encryption/conversations/${conversationId}/enable`,
      {
        method: 'POST',
      },
    ),

  getSafetyNumber: (userId: string) =>
    apiRequest<{ safetyNumber: string }>(`/encryption/users/${userId}/safety-number`, {
      method: 'GET',
    }),

  // Phase 4: Media & Notifications APIs
  presignUpload: (dto: PresignUploadInput) =>
    apiRequest<PresignUploadResponse>('/media/presign', {
      method: 'POST',
      body: JSON.stringify(dto),
    }),

  confirmUpload: (attachmentId: string) =>
    apiRequest<MediaAttachmentItem>(`/media/${attachmentId}/confirm`, {
      method: 'POST',
    }),

  getMediaDownloadUrl: (attachmentId: string) =>
    apiRequest<MediaDownloadUrlResponse>(`/media/${attachmentId}/url`, {
      method: 'GET',
    }),

  getNotifications: (cursor?: string, limit = 20) => {
    const params = new URLSearchParams();
    if (cursor) params.append('cursor', cursor);
    if (limit) params.append('limit', limit.toString());
    const query = params.toString();
    return apiRequest<PaginatedNotificationsResponse>(
      `/notifications${query ? `?${query}` : ''}`,
      { method: 'GET' },
    );
  },

  markNotificationRead: (id: string) =>
    apiRequest<NotificationItem>(`/notifications/${id}/read`, {
      method: 'PATCH',
    }),

  markAllNotificationsRead: () =>
    apiRequest<{ success: boolean; count: number }>('/notifications/read-all', {
      method: 'POST',
    }),

  // Phase 5: Communities, Channels, Invites & RBAC APIs
  createCommunity: (dto: CreateCommunityDto) =>
    apiRequest<CommunityItem>('/communities', {
      method: 'POST',
      body: JSON.stringify(dto),
    }),

  getMyCommunities: () =>
    apiRequest<CommunityItem[]>('/communities', {
      method: 'GET',
    }),

  discoverCommunities: (query?: string, cursor?: string, limit = 20) => {
    const params = new URLSearchParams();
    if (query) params.append('q', query);
    if (cursor) params.append('cursor', cursor);
    if (limit) params.append('limit', limit.toString());
    const qStr = params.toString();
    return apiRequest<{
      data: (CommunityItem & { isMember: boolean })[];
      meta: { nextCursor: string | null; hasMore: boolean };
    }>(`/communities/discover${qStr ? `?${qStr}` : ''}`, { method: 'GET' });
  },

  getCommunity: (communityId: string) =>
    apiRequest<CommunityDetail>(`/communities/${communityId}`, {
      method: 'GET',
    }),

  updateCommunity: (communityId: string, dto: UpdateCommunityDto) =>
    apiRequest<CommunityItem>(`/communities/${communityId}`, {
      method: 'PATCH',
      body: JSON.stringify(dto),
    }),

  deleteCommunity: (communityId: string) =>
    apiRequest<{ success: boolean }>(`/communities/${communityId}`, {
      method: 'DELETE',
    }),

  joinCommunity: (communityId: string) =>
    apiRequest<CommunityItem>(`/communities/${communityId}/join`, {
      method: 'POST',
    }),

  leaveCommunity: (communityId: string) =>
    apiRequest<{ success: boolean }>(`/communities/${communityId}/leave`, {
      method: 'DELETE',
    }),

  updateMemberRole: (communityId: string, userId: string, dto: UpdateMemberRoleDto) =>
    apiRequest<CommunityMemberItem>(`/communities/${communityId}/members/${userId}/role`, {
      method: 'PATCH',
      body: JSON.stringify(dto),
    }),

  kickMember: (communityId: string, userId: string) =>
    apiRequest<{ success: boolean }>(`/communities/${communityId}/members/${userId}`, {
      method: 'DELETE',
    }),

  createInvite: (communityId: string, dto: CreateInviteDto) =>
    apiRequest<CommunityInviteItem>(`/communities/${communityId}/invites`, {
      method: 'POST',
      body: JSON.stringify(dto),
    }),

  getInvites: (communityId: string) =>
    apiRequest<CommunityInviteItem[]>(`/communities/${communityId}/invites`, {
      method: 'GET',
    }),

  joinByInviteCode: (code: string) =>
    apiRequest<CommunityItem>(`/communities/invites/${code}/join`, {
      method: 'POST',
    }),

  createChannel: (communityId: string, dto: CreateChannelDto) =>
    apiRequest<ChannelItem>(`/communities/${communityId}/channels`, {
      method: 'POST',
      body: JSON.stringify(dto),
    }),

  updateChannel: (channelId: string, dto: UpdateChannelDto) =>
    apiRequest<ChannelItem>(`/channels/${channelId}`, {
      method: 'PATCH',
      body: JSON.stringify(dto),
    }),

  deleteChannel: (channelId: string) =>
    apiRequest<{ success: boolean }>(`/channels/${channelId}`, {
      method: 'DELETE',
    }),

  getChannelMessages: (channelId: string, cursor?: string, limit = 50) => {
    const params = new URLSearchParams();
    if (cursor) params.append('cursor', cursor);
    if (limit) params.append('limit', limit.toString());
    const qStr = params.toString();
    return apiRequest<{
      data: ChannelMessageItem[];
      meta: { nextCursor: string | null; hasMore: boolean };
    }>(`/channels/${channelId}/messages${qStr ? `?${qStr}` : ''}`, { method: 'GET' });
  },

  sendChannelMessage: (channelId: string, dto: SendChannelMessageDto) =>
    apiRequest<ChannelMessageItem>(`/channels/${channelId}/messages`, {
      method: 'POST',
      body: JSON.stringify(dto),
    }),

  editChannelMessage: (messageId: string, dto: EditChannelMessageDto) =>
    apiRequest<ChannelMessageItem>(`/channels/messages/${messageId}`, {
      method: 'PATCH',
      body: JSON.stringify(dto),
    }),

  deleteChannelMessage: (messageId: string) =>
    apiRequest<{ success: boolean }>(`/channels/messages/${messageId}`, {
      method: 'DELETE',
    }),

  // Phase 6: Social Graph, Posts, Likes, Comments & Stories APIs
  followUser: (userId: string) =>
    apiRequest<{ success: boolean; isFollowing: boolean }>(`/users/${userId}/follow`, {
      method: 'POST',
    }),

  unfollowUser: (userId: string) =>
    apiRequest<{ success: boolean; isFollowing: boolean }>(`/users/${userId}/follow`, {
      method: 'DELETE',
    }),

  getFollowers: (userId: string, cursor?: string, limit = 20) => {
    const params = new URLSearchParams();
    if (cursor) params.append('cursor', cursor);
    if (limit) params.append('limit', limit.toString());
    const qStr = params.toString();
    return apiRequest<{
      data: FollowUserSummary[];
      meta: { nextCursor: string | null; hasMore: boolean };
    }>(`/users/${userId}/followers${qStr ? `?${qStr}` : ''}`, { method: 'GET' });
  },

  getFollowing: (userId: string, cursor?: string, limit = 20) => {
    const params = new URLSearchParams();
    if (cursor) params.append('cursor', cursor);
    if (limit) params.append('limit', limit.toString());
    const qStr = params.toString();
    return apiRequest<{
      data: FollowUserSummary[];
      meta: { nextCursor: string | null; hasMore: boolean };
    }>(`/users/${userId}/following${qStr ? `?${qStr}` : ''}`, { method: 'GET' });
  },

  createPost: (dto: CreatePostDto) =>
    apiRequest<PostItem>('/posts', {
      method: 'POST',
      body: JSON.stringify(dto),
    }),

  getPostsFeed: (tab: 'following' | 'explore' = 'following', cursor?: string, limit = 20) => {
    const params = new URLSearchParams();
    params.append('tab', tab);
    if (cursor) params.append('cursor', cursor);
    if (limit) params.append('limit', limit.toString());
    const qStr = params.toString();
    return apiRequest<{
      data: PostItem[];
      meta: { nextCursor: string | null; hasMore: boolean };
    }>(`/posts/feed?${qStr}`, { method: 'GET' });
  },

  getUserPosts: (userId: string, cursor?: string, limit = 20) => {
    const params = new URLSearchParams();
    if (cursor) params.append('cursor', cursor);
    if (limit) params.append('limit', limit.toString());
    const qStr = params.toString();
    return apiRequest<{
      data: PostItem[];
      meta: { nextCursor: string | null; hasMore: boolean };
    }>(`/posts/user/${userId}${qStr ? `?${qStr}` : ''}`, { method: 'GET' });
  },

  getPost: (postId: string) =>
    apiRequest<PostItem>(`/posts/${postId}`, {
      method: 'GET',
    }),

  deletePost: (postId: string) =>
    apiRequest<{ success: boolean }>(`/posts/${postId}`, {
      method: 'DELETE',
    }),

  likePost: (postId: string) =>
    apiRequest<{ success: boolean; isLiked: boolean; likesCount: number }>(`/posts/${postId}/like`, {
      method: 'POST',
    }),

  unlikePost: (postId: string) =>
    apiRequest<{ success: boolean; isLiked: boolean; likesCount: number }>(`/posts/${postId}/like`, {
      method: 'DELETE',
    }),

  getPostComments: (postId: string, cursor?: string, limit = 20) => {
    const params = new URLSearchParams();
    if (cursor) params.append('cursor', cursor);
    if (limit) params.append('limit', limit.toString());
    const qStr = params.toString();
    return apiRequest<{
      data: PostCommentItem[];
      meta: { nextCursor: string | null; hasMore: boolean };
    }>(`/posts/${postId}/comments${qStr ? `?${qStr}` : ''}`, { method: 'GET' });
  },

  createPostComment: (postId: string, dto: CreateCommentDto) =>
    apiRequest<PostCommentItem>(`/posts/${postId}/comments`, {
      method: 'POST',
      body: JSON.stringify(dto),
    }),

  deletePostComment: (commentId: string) =>
    apiRequest<{ success: boolean }>(`/posts/comments/${commentId}`, {
      method: 'DELETE',
    }),

  createStory: (dto: CreateStoryDto) =>
    apiRequest<StoryItem>('/stories', {
      method: 'POST',
      body: JSON.stringify(dto),
    }),

  getStoriesFeed: () =>
    apiRequest<AuthorStoriesGroup[]>('/stories/feed', {
      method: 'GET',
    }),

  markStoryViewed: (storyId: string) =>
    apiRequest<{ success: boolean }>(`/stories/${storyId}/view`, {
      method: 'POST',
    }),

  getStoryViews: (storyId: string) =>
    apiRequest<{ data: StoryViewerItem[]; meta: { totalCount: number } }>(`/stories/${storyId}/views`, {
      method: 'GET',
    }),

  deleteStory: (storyId: string) =>
    apiRequest<{ success: boolean }>(`/stories/${storyId}`, {
      method: 'DELETE',
    }),

  // Phase 7 WebRTC Calls
  getIceServers: () =>
    apiRequest<IceServersResponse>('/calls/ice-servers', {
      method: 'GET',
    }),

  getCallHistory: (cursor?: string, limit = 20) => {
    const params = new URLSearchParams();
    if (cursor) params.append('cursor', cursor);
    if (limit) params.append('limit', limit.toString());
    const qStr = params.toString();
    return apiRequest<PaginatedCallsResponse>(`/calls/history${qStr ? `?${qStr}` : ''}`, {
      method: 'GET',
    });
  },

  getConversationCallHistory: (conversationId: string, cursor?: string, limit = 20) => {
    const params = new URLSearchParams();
    if (cursor) params.append('cursor', cursor);
    if (limit) params.append('limit', limit.toString());
    const qStr = params.toString();
    return apiRequest<PaginatedCallsResponse>(
      `/conversations/${conversationId}/calls${qStr ? `?${qStr}` : ''}`,
      { method: 'GET' },
    );
  },
};
