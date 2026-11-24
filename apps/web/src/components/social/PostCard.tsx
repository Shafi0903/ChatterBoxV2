'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Heart,
  MessageCircle,
  Share2,
  Trash2,
  Users,
  Globe,
  MoreVertical,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth.store';
import { useSocialStore } from '@/stores/social.store';
import { AttachmentList } from '@/components/chat/AttachmentList';
import { PostComments } from './PostComments';
import type { PostItem } from '@chatterbox/shared';

interface PostCardProps {
  post: PostItem;
  onPostUpdated?: (updated: PostItem) => void;
  onPostDeleted?: (postId: string) => void;
  defaultExpandedComments?: boolean;
}

export function PostCard({
  post,
  onPostUpdated,
  onPostDeleted,
  defaultExpandedComments = false,
}: PostCardProps) {
  const { user } = useAuthStore();
  const { toggleLike: toggleLikeInStore, deletePost: deletePostInStore } = useSocialStore();

  const [showComments, setShowComments] = useState(defaultExpandedComments);
  const [likesCount, setLikesCount] = useState(post.likesCount);
  const [isLiked, setIsLiked] = useState(post.isLiked);
  const [commentsCount, setCommentsCount] = useState(post.commentsCount);
  const [isLiking, setIsLiking] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const isAuthor = user?.id === post.author.id;

  const handleLike = async () => {
    if (isLiking) return;
    const previousLiked = isLiked;
    const delta = previousLiked ? -1 : 1;

    // Optimistic UI
    setIsLiked(!previousLiked);
    setLikesCount((prev) => Math.max(0, prev + delta));
    toggleLikeInStore(post.id);

    try {
      setIsLiking(true);
      if (previousLiked) {
        await api.unlikePost(post.id);
      } else {
        await api.likePost(post.id);
      }
      onPostUpdated?.({
        ...post,
        isLiked: !previousLiked,
        likesCount: Math.max(0, likesCount + delta),
      });
    } catch (err: any) {
      // Revert optimistic update
      setIsLiked(previousLiked);
      setLikesCount((prev) => Math.max(0, prev - delta));
      toggleLikeInStore(post.id);
      console.error('Failed to toggle like', err);
    } finally {
      setIsLiking(false);
    }
  };

  const handleDelete = async () => {
    if (!isAuthor || isDeleting) return;
    if (!confirm('Are you sure you want to delete this post?')) return;

    try {
      setIsDeleting(true);
      await api.deletePost(post.id);
      deletePostInStore(post.id);
      onPostDeleted?.(post.id);
    } catch (err: any) {
      alert(err.message || 'Failed to delete post');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleShare = async () => {
    const url = `${window.location.origin}/posts/${post.id}`;
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(url);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  return (
    <article className="bg-zinc-950/80 border border-zinc-800/80 rounded-2xl p-5 backdrop-blur-sm transition-all hover:border-zinc-700/80">
      {/* Post Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3">
          <Link
            href={`/profile/${post.author.username}`}
            className="w-10 h-10 rounded-full bg-gradient-to-tr from-cyan-500 to-indigo-600 flex items-center justify-center font-bold text-white text-sm flex-shrink-0 hover:ring-2 hover:ring-cyan-400 transition-all"
          >
            {post.author.avatarUrl ? (
              <img
                src={post.author.avatarUrl}
                alt={post.author.displayName || post.author.username}
                className="w-full h-full rounded-full object-cover"
              />
            ) : (
              (post.author.displayName || post.author.username).charAt(0).toUpperCase()
            )}
          </Link>

          <div className="flex flex-col">
            <div className="flex items-center gap-2 flex-wrap">
              <Link
                href={`/profile/${post.author.username}`}
                className="text-white font-semibold text-sm hover:underline"
              >
                {post.author.displayName || post.author.username}
              </Link>
              <span className="text-zinc-500 text-xs">@{post.author.username}</span>
            </div>

            <div className="flex items-center gap-2 text-zinc-500 text-xs mt-0.5">
              <span>{new Date(post.createdAt).toLocaleDateString()}</span>
              <span>•</span>
              <span className="flex items-center gap-1">
                {post.visibility === 'FOLLOWERS' ? (
                  <>
                    <Users className="w-3 h-3 text-indigo-400" />
                    <span>Followers only</span>
                  </>
                ) : (
                  <>
                    <Globe className="w-3 h-3 text-cyan-400" />
                    <span>Public</span>
                  </>
                )}
              </span>
            </div>
          </div>
        </div>

        {/* Author Actions */}
        {isAuthor && (
          <button
            onClick={handleDelete}
            disabled={isDeleting}
            className="text-zinc-500 hover:text-red-400 p-1.5 rounded-lg hover:bg-zinc-900 transition-colors"
            title="Delete post"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Post Content */}
      {post.content && (
        <p className="text-zinc-200 text-sm whitespace-pre-wrap leading-relaxed break-words mb-3">
          {post.content}
        </p>
      )}

      {/* Attachments List */}
      {post.attachments && post.attachments.length > 0 && (
        <div className="mb-4">
          <AttachmentList attachments={post.attachments} />
        </div>
      )}

      {/* Action Bar (Like, Comment, Share) */}
      <div className="flex items-center justify-between pt-3 border-t border-zinc-800/80 text-zinc-400 text-xs">
        <div className="flex items-center gap-6">
          {/* Like Button */}
          <button
            onClick={handleLike}
            disabled={isLiking}
            className={`flex items-center gap-1.5 transition-colors group ${
              isLiked ? 'text-rose-500' : 'hover:text-rose-400'
            }`}
          >
            <Heart
              className={`w-4 h-4 transition-transform group-hover:scale-110 ${
                isLiked ? 'fill-rose-500 stroke-rose-500' : ''
              }`}
            />
            <span className="font-medium">{likesCount}</span>
          </button>

          {/* Comment Toggle Button */}
          <button
            onClick={() => setShowComments((prev) => !prev)}
            className="flex items-center gap-1.5 hover:text-cyan-400 transition-colors group"
          >
            <MessageCircle className="w-4 h-4 transition-transform group-hover:scale-110" />
            <span className="font-medium">{commentsCount}</span>
          </button>
        </div>

        {/* Share Permalink Button */}
        <button
          onClick={handleShare}
          className="flex items-center gap-1.5 hover:text-white transition-colors"
          title="Copy link to post"
        >
          <Share2 className="w-4 h-4" />
          <span>{copiedLink ? 'Copied!' : 'Share'}</span>
        </button>
      </div>

      {/* Comments Section */}
      {showComments && (
        <PostComments
          postId={post.id}
          onCommentCountChange={(delta) => {
            setCommentsCount((prev) => Math.max(0, prev + delta));
            onPostUpdated?.({
              ...post,
              commentsCount: Math.max(0, commentsCount + delta),
            });
          }}
        />
      )}
    </article>
  );
}
