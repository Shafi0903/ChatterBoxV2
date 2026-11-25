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

  const isAuthor = Boolean(
    user && (user.id === post.author.id || user.id === post.authorId || user.username === post.author.username)
  );

  const handleLike = async () => {
    if (isLiking) return;
    const previousLiked = isLiked;
    const previousCount = likesCount;
    const delta = previousLiked ? -1 : 1;

    // Optimistic UI
    setIsLiked(!previousLiked);
    setLikesCount(Math.max(0, previousCount + delta));

    try {
      setIsLiking(true);
      const res = await toggleLikeInStore(post.id, previousLiked, previousCount);
      setIsLiked(res.isLiked);
      setLikesCount(res.likesCount);
      onPostUpdated?.({
        ...post,
        isLiked: res.isLiked,
        likesCount: res.likesCount,
      });
    } catch (err: any) {
      // Revert optimistic update
      setIsLiked(previousLiked);
      setLikesCount(previousCount);
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
      await deletePostInStore(post.id);
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
    <article className="bg-surface border border-border rounded-2xl p-5 shadow-xs transition-all hover:border-accent/40">
      {/* Post Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3">
          <Link
            href={`/profile/${post.author.username}`}
            className="w-10 h-10 rounded-full bg-gradient-to-tr from-accent to-accent-bright flex items-center justify-center font-bold text-white text-sm flex-shrink-0 hover:ring-2 hover:ring-accent transition-all"
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
                className="text-primary font-semibold text-sm hover:underline"
              >
                {post.author.displayName || post.author.username}
              </Link>
              <span className="text-secondary text-xs">@{post.author.username}</span>
            </div>

            <div className="flex items-center gap-2 text-secondary text-xs mt-0.5">
              <span>{new Date(post.createdAt).toLocaleDateString()}</span>
              <span>•</span>
              <span className="flex items-center gap-1">
                {post.visibility === 'FOLLOWERS' ? (
                  <>
                    <Users className="w-3 h-3 text-accent-bright" />
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
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleDelete}
              disabled={isDeleting}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-secondary hover:text-rose-400 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 text-xs font-medium transition-all cursor-pointer disabled:opacity-50"
              title="Delete post"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Delete</span>
            </button>
          </div>
        )}
      </div>

      {/* Post Content */}
      {post.content && (
        <p className="text-primary text-sm whitespace-pre-wrap leading-relaxed break-words mb-3">
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
      <div className="flex items-center justify-between pt-3 border-t border-border text-secondary text-xs">
        <div className="flex items-center gap-6">
          {/* Like Button */}
          <button
            onClick={handleLike}
            disabled={isLiking}
            className={`flex items-center gap-1.5 transition-colors group ${
              isLiked ? 'text-status-busy' : 'hover:text-status-busy'
            }`}
          >
            <Heart
              className={`w-4 h-4 transition-transform group-hover:scale-110 ${
                isLiked ? 'fill-status-busy stroke-status-busy' : ''
              }`}
            />
            <span className="font-medium text-primary">{likesCount}</span>
          </button>

          {/* Comment Toggle Button */}
          <button
            onClick={() => setShowComments((prev) => !prev)}
            className="flex items-center gap-1.5 hover:text-accent-bright transition-colors group"
          >
            <MessageCircle className="w-4 h-4 transition-transform group-hover:scale-110" />
            <span className="font-medium text-primary">{commentsCount}</span>
          </button>
        </div>

        {/* Share Permalink Button */}
        <button
          onClick={handleShare}
          className="flex items-center gap-1.5 hover:text-primary transition-colors"
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
