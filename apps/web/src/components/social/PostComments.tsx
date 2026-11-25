'use client';

import React, { useState, useEffect } from 'react';
import { Send, Trash2, MessageCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth.store';
import type { PostCommentItem } from '@chatterbox/shared';

interface PostCommentsProps {
  postId: string;
  onCommentCountChange?: (delta: number) => void;
}

export function PostComments({ postId, onCommentCountChange }: PostCommentsProps) {
  const { user } = useAuthStore();
  const [comments, setComments] = useState<PostCommentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [newCommentText, setNewCommentText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isForbidden, setIsForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchComments = async (cursor?: string) => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.getPostComments(postId, cursor, 15);
      if (cursor) {
        setComments((prev) => [...prev, ...res.data]);
      } else {
        setComments(res.data);
      }
      setNextCursor(res.meta?.nextCursor ?? null);
      setHasMore(res.meta?.hasMore ?? false);
    } catch (err: any) {
      if (err.status === 403) {
        setIsForbidden(true);
      } else {
        setError(err.message || 'Failed to load comments');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchComments();
  }, [postId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const content = newCommentText.trim();
    if (!content || isSubmitting) return;

    try {
      setIsSubmitting(true);
      const newComment = await api.createPostComment(postId, { content });
      setComments((prev) => [newComment, ...prev]);
      setNewCommentText('');
      onCommentCountChange?.(1);
    } catch (err: any) {
      alert(err.message || 'Failed to post comment');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (commentId: string) => {
    if (!confirm('Are you sure you want to delete this comment?')) return;
    try {
      await api.deletePostComment(commentId);
      setComments((prev) => prev.filter((c) => c.id !== commentId));
      onCommentCountChange?.(-1);
    } catch (err: any) {
      alert(err.message || 'Failed to delete comment');
    }
  };

  if (isForbidden) {
    return (
      <div className="p-4 bg-elevated border border-border rounded-xl text-center text-xs text-secondary">
        Comments are only available to followers of this user.
      </div>
    );
  }

  return (
    <div className="mt-3 pt-3 border-t border-border space-y-3">
      {/* Add Comment Input */}
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <input
          type="text"
          value={newCommentText}
          onChange={(e) => setNewCommentText(e.target.value)}
          placeholder="Add a comment..."
          maxLength={1000}
          className="flex-1 px-3 py-2 bg-elevated border border-border rounded-xl text-xs text-primary placeholder:text-muted focus:outline-none focus:border-accent"
        />
        <button
          type="submit"
          disabled={!newCommentText.trim() || isSubmitting}
          className="p-2 rounded-xl bg-accent hover:bg-accent-bright disabled:opacity-40 text-white transition-colors"
        >
          <Send className="w-3.5 h-3.5 stroke-[2.5]" />
        </button>
      </form>

      {/* Comments List */}
      {error && (
        <div className="p-2.5 rounded-xl bg-status-busy/10 border border-status-busy/25 text-xs text-status-busy flex items-center justify-between gap-2">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => fetchComments()}
            className="font-semibold underline shrink-0"
          >
            Retry
          </button>
        </div>
      )}

      {loading && comments.length === 0 ? (
        <div className="py-4 text-center">
          <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto" />
        </div>
      ) : comments.length === 0 ? (
        <p className="text-secondary text-xs text-center py-2">
          No comments yet. Be the first to reply!
        </p>
      ) : (
        <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
          {comments.map((comment) => {
            const isAuthor = user?.id === comment.author.id;
            return (
              <div
                key={comment.id}
                className="group flex items-start justify-between gap-2 p-2.5 rounded-xl bg-elevated/60 border border-border/60 hover:border-border transition-colors"
              >
                <div className="flex items-start gap-2.5 min-w-0">
                  <div className="w-6 h-6 rounded-full bg-accent/20 text-accent-bright flex items-center justify-center font-bold text-[10px] flex-shrink-0 mt-0.5">
                    {comment.author.avatarUrl ? (
                      <img
                        src={comment.author.avatarUrl}
                        alt={comment.author.displayName || comment.author.username}
                        className="w-full h-full rounded-full object-cover"
                      />
                    ) : (
                      (comment.author.displayName || comment.author.username)
                        .charAt(0)
                        .toUpperCase()
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-1.5 flex-wrap">
                      <span className="text-primary text-xs font-semibold">
                        {comment.author.displayName || comment.author.username}
                      </span>
                      <span className="text-secondary text-[10px]">
                        @{comment.author.username}
                      </span>
                      <span className="text-muted text-[10px]">
                        • {new Date(comment.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-primary text-xs break-words mt-0.5 whitespace-pre-wrap leading-relaxed">
                      {comment.content}
                    </p>
                  </div>
                </div>

                {isAuthor && (
                  <button
                    onClick={() => handleDelete(comment.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-secondary hover:text-status-busy transition-opacity flex-shrink-0"
                    title="Delete comment"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            );
          })}

          {hasMore && (
            <button
              onClick={() => fetchComments(nextCursor ?? undefined)}
              disabled={loading}
              className="w-full py-1.5 text-xs text-accent-bright hover:underline font-medium"
            >
              {loading ? 'Loading...' : 'Load more comments'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
