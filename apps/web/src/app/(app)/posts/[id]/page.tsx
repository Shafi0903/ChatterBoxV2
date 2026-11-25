'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, ShieldAlert } from 'lucide-react';
import { api } from '@/lib/api';
import { PostCard } from '@/components/social/PostCard';
import type { PostItem } from '@chatterbox/shared';

export default function PostPermalinkPage() {
  const params = useParams();
  const router = useRouter();
  const postId = params?.id as string;

  const [post, setPost] = useState<PostItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorStatus, setErrorStatus] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!postId) return;
    setLoading(true);
    setErrorStatus(null);
    setErrorMessage(null);

    api
      .getPost(postId)
      .then((data) => {
        setPost(data);
      })
      .catch((err: any) => {
        setErrorStatus(err.status ?? 500);
        setErrorMessage(err.message || 'Failed to load post');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [postId]);

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto py-12 flex flex-col items-center justify-center gap-3">
        <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-zinc-500 text-xs">Loading post...</p>
      </div>
    );
  }

  if (errorStatus === 403) {
    return (
      <div className="max-w-2xl mx-auto py-12 px-4">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-secondary hover:text-primary text-xs mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>

        <div className="bg-surface border border-border rounded-2xl p-8 text-center shadow-xs">
          <div className="w-12 h-12 rounded-full bg-accent/15 border border-border flex items-center justify-center text-accent-bright mx-auto mb-3">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <h2 className="text-base font-semibold text-primary">Followers-Only Post</h2>
          <p className="text-xs text-secondary mt-1.5 max-w-sm mx-auto">
            This post is private and only visible to confirmed followers of the author.
          </p>
        </div>
      </div>
    );
  }

  if (errorStatus === 404 || !post) {
    return (
      <div className="max-w-2xl mx-auto py-12 px-4">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-secondary hover:text-primary text-xs mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>

        <div className="bg-surface border border-border rounded-2xl p-8 text-center shadow-xs">
          <h2 className="text-base font-semibold text-primary">Post Not Found</h2>
          <p className="text-xs text-secondary mt-1.5">
            {errorMessage || 'This post may have been removed or does not exist.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-4 px-2 pb-16">
      <button
        onClick={() => router.back()}
        className="flex items-center gap-2 text-secondary hover:text-primary text-xs mb-4 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back to feed</span>
      </button>

      <PostCard
        post={post}
        defaultExpandedComments={true}
        onPostDeleted={() => router.push('/home')}
        onPostUpdated={(updated) => setPost(updated)}
      />
    </div>
  );
}
