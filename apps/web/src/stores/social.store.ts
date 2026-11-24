import { create } from 'zustand';
import {
  PostItem,
  AuthorStoriesGroup,
  CreatePostDto,
  CreateStoryDto,
  StoryItem,
} from '@chatterbox/shared';
import { api } from '../lib/api';

interface SocialState {
  activeTab: 'following' | 'explore';
  postsByTab: Record<'following' | 'explore', PostItem[]>;
  hasMoreByTab: Record<'following' | 'explore', boolean>;
  nextCursorByTab: Record<'following' | 'explore', string | null>;
  isLoadingFeed: boolean;
  isLoadingMore: boolean;

  storyGroups: AuthorStoriesGroup[];
  isLoadingStories: boolean;

  // Actions
  setActiveTab: (tab: 'following' | 'explore') => void;
  fetchFeed: (tab?: 'following' | 'explore', isRefresh?: boolean) => Promise<void>;
  fetchOlderFeed: (tab?: 'following' | 'explore') => Promise<void>;
  createPost: (dto: CreatePostDto) => Promise<PostItem>;
  deletePost: (postId: string) => Promise<void>;
  toggleLike: (postId: string) => Promise<void>;
  prependPost: (post: PostItem) => void;
  updatePostInFeeds: (post: PostItem) => void;

  fetchStories: () => Promise<void>;
  createStory: (dto: CreateStoryDto) => Promise<StoryItem>;
  markStoryViewedLocal: (storyId: string) => void;
  deleteStoryLocal: (storyId: string) => Promise<void>;

  resetSocialState: () => void;
}

export const useSocialStore = create<SocialState>((set, get) => ({
  activeTab: 'following',
  postsByTab: {
    following: [],
    explore: [],
  },
  hasMoreByTab: {
    following: false,
    explore: false,
  },
  nextCursorByTab: {
    following: null,
    explore: null,
  },
  isLoadingFeed: false,
  isLoadingMore: false,

  storyGroups: [],
  isLoadingStories: false,

  setActiveTab: (tab) => {
    set({ activeTab: tab });
    if (get().postsByTab[tab].length === 0) {
      get().fetchFeed(tab);
    }
  },

  fetchFeed: async (tab, isRefresh = false) => {
    const targetTab = tab || get().activeTab;
    set({ isLoadingFeed: true });
    try {
      const res = await api.getPostsFeed(targetTab, undefined, 20);
      set((state) => ({
        isLoadingFeed: false,
        postsByTab: {
          ...state.postsByTab,
          [targetTab]: res.data,
        },
        hasMoreByTab: {
          ...state.hasMoreByTab,
          [targetTab]: res.meta.hasMore,
        },
        nextCursorByTab: {
          ...state.nextCursorByTab,
          [targetTab]: res.meta.nextCursor,
        },
      }));
    } catch (err) {
      set({ isLoadingFeed: false });
      throw err;
    }
  },

  fetchOlderFeed: async (tab) => {
    const targetTab = tab || get().activeTab;
    const { isLoadingMore, hasMoreByTab, nextCursorByTab } = get();
    if (isLoadingMore || !hasMoreByTab[targetTab]) return;

    const cursor = nextCursorByTab[targetTab];
    if (!cursor) return;

    set({ isLoadingMore: true });
    try {
      const res = await api.getPostsFeed(targetTab, cursor, 20);
      set((state) => {
        const currentList = state.postsByTab[targetTab] || [];
        const existingIds = new Set(currentList.map((p) => p.id));
        const newOlder = res.data.filter((p) => !existingIds.has(p.id));

        return {
          isLoadingMore: false,
          postsByTab: {
            ...state.postsByTab,
            [targetTab]: [...currentList, ...newOlder],
          },
          hasMoreByTab: {
            ...state.hasMoreByTab,
            [targetTab]: res.meta.hasMore,
          },
          nextCursorByTab: {
            ...state.nextCursorByTab,
            [targetTab]: res.meta.nextCursor,
          },
        };
      });
    } catch (err) {
      set({ isLoadingMore: false });
      throw err;
    }
  },

  createPost: async (dto) => {
    const post = await api.createPost(dto);
    get().prependPost(post);
    return post;
  },

  prependPost: (post) => {
    set((state) => ({
      postsByTab: {
        following: [post, ...state.postsByTab.following],
        explore: post.visibility === 'PUBLIC' ? [post, ...state.postsByTab.explore] : state.postsByTab.explore,
      },
    }));
  },

  updatePostInFeeds: (updated) => {
    set((state) => ({
      postsByTab: {
        following: state.postsByTab.following.map((p) => (p.id === updated.id ? updated : p)),
        explore: state.postsByTab.explore.map((p) => (p.id === updated.id ? updated : p)),
      },
    }));
  },

  deletePost: async (postId) => {
    await api.deletePost(postId);
    set((state) => ({
      postsByTab: {
        following: state.postsByTab.following.filter((p) => p.id !== postId),
        explore: state.postsByTab.explore.filter((p) => p.id !== postId),
      },
    }));
  },

  toggleLike: async (postId) => {
    const { postsByTab } = get();
    // Locate post in either tab
    let post = postsByTab.following.find((p) => p.id === postId) || postsByTab.explore.find((p) => p.id === postId);
    if (!post) return;

    const previousLiked = post.isLiked;
    const previousLikesCount = post.likesCount;
    const nextLiked = !previousLiked;
    const nextLikesCount = nextLiked ? previousLikesCount + 1 : Math.max(0, previousLikesCount - 1);

    // Optimistic update
    set((state) => ({
      postsByTab: {
        following: state.postsByTab.following.map((p) =>
          p.id === postId ? { ...p, isLiked: nextLiked, likesCount: nextLikesCount } : p,
        ),
        explore: state.postsByTab.explore.map((p) =>
          p.id === postId ? { ...p, isLiked: nextLiked, likesCount: nextLikesCount } : p,
        ),
      },
    }));

    try {
      if (nextLiked) {
        await api.likePost(postId);
      } else {
        await api.unlikePost(postId);
      }
    } catch {
      // Revert on failure
      set((state) => ({
        postsByTab: {
          following: state.postsByTab.following.map((p) =>
            p.id === postId ? { ...p, isLiked: previousLiked, likesCount: previousLikesCount } : p,
          ),
          explore: state.postsByTab.explore.map((p) =>
            p.id === postId ? { ...p, isLiked: previousLiked, likesCount: previousLikesCount } : p,
          ),
        },
      }));
    }
  },

  fetchStories: async () => {
    set({ isLoadingStories: true });
    try {
      const groups = await api.getStoriesFeed();
      set({ storyGroups: groups, isLoadingStories: false });
    } catch (err) {
      set({ isLoadingStories: false });
      throw err;
    }
  },

  createStory: async (dto) => {
    const story = await api.createStory(dto);
    await get().fetchStories();
    return story;
  },

  markStoryViewedLocal: (storyId) => {
    set((state) => {
      const updatedGroups = state.storyGroups.map((group) => {
        const updatedStories = group.stories.map((s) =>
          s.id === storyId ? { ...s, hasViewed: true } : s,
        );
        const hasUnviewed = updatedStories.some((s) => !s.hasViewed);
        return {
          ...group,
          stories: updatedStories,
          hasUnviewed,
        };
      });

      return { storyGroups: updatedGroups };
    });
  },

  deleteStoryLocal: async (storyId) => {
    await api.deleteStory(storyId);
    set((state) => {
      const updatedGroups = state.storyGroups
        .map((group) => ({
          ...group,
          stories: group.stories.filter((s) => s.id !== storyId),
        }))
        .filter((group) => group.stories.length > 0);

      return { storyGroups: updatedGroups };
    });
  },

  resetSocialState: () => {
    set({
      activeTab: 'following',
      postsByTab: { following: [], explore: [] },
      hasMoreByTab: { following: false, explore: false },
      nextCursorByTab: { following: null, explore: null },
      isLoadingFeed: false,
      isLoadingMore: false,
      storyGroups: [],
      isLoadingStories: false,
    });
  },
}));
