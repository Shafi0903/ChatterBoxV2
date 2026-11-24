'use client';

import React, { Suspense, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useChatStore } from '../../../stores/chat.store';
import { ConversationList } from '../../../components/chat/ConversationList';
import { ActiveChat } from '../../../components/chat/ActiveChat';
import { GroupDetailsPanel } from '../../../components/chat/GroupDetailsPanel';
import { Skeleton } from '../../../components/ui/Skeleton';
import { cn } from '../../../lib/utils';

function MessagesWorkspace() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const {
    activeConversationId,
    selectConversation,
    isDetailsOpen,
    setDetailsOpen,
  } = useChatStore();

  const queryConversationId = searchParams.get('c');

  // Synchronize ?c=<id> query param on load
  useEffect(() => {
    if (queryConversationId && queryConversationId !== activeConversationId) {
      selectConversation(queryConversationId);
    }
  }, [queryConversationId, activeConversationId, selectConversation]);

  const handleSelectConversation = (id: string) => {
    selectConversation(id);
    router.replace(`/messages?c=${id}`, { scroll: false });
  };

  const handleBackToConversations = () => {
    selectConversation(null);
    router.replace('/messages', { scroll: false });
  };

  return (
    <div className="flex h-full w-full overflow-hidden bg-canvas rounded-2xl border border-border shadow-xl">
      {/* 1. Left Pane: Conversations List */}
      <div
        className={cn(
          'w-full md:w-[300px] h-full shrink-0 flex-col',
          // On mobile: show only if no active conversation is selected
          activeConversationId ? 'hidden md:flex' : 'flex',
        )}
      >
        <ConversationList onSelectConversation={handleSelectConversation} />
      </div>

      {/* 2. Center Pane: Active Chat Window */}
      <div
        className={cn(
          'flex-1 h-full min-w-0 flex flex-col',
          // On mobile: show only if a conversation is selected
          !activeConversationId ? 'hidden md:flex' : 'flex',
        )}
      >
        <ActiveChat
          conversationId={activeConversationId}
          onBack={handleBackToConversations}
        />
      </div>

      {/* 3. Right Pane: Group Members & Details */}
      {isDetailsOpen && activeConversationId && (
        <>
          {/* Desktop static pane */}
          <div className="hidden lg:flex h-full">
            <GroupDetailsPanel onClose={() => setDetailsOpen(false)} />
          </div>

          {/* Mobile & Tablet Slide-over Drawer */}
          <div className="lg:hidden fixed inset-0 z-50 flex justify-end animate-in fade-in duration-150">
            <div
              className="fixed inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setDetailsOpen(false)}
            />
            <div className="relative z-10 w-[280px] h-full shadow-2xl animate-in slide-in-from-right duration-200">
              <GroupDetailsPanel onClose={() => setDetailsOpen(false)} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function MessagesLoadingSkeleton() {
  return (
    <div className="flex h-full w-full overflow-hidden bg-canvas rounded-2xl border border-border">
      <div className="w-[300px] h-full bg-surface border-r border-border p-4 space-y-4">
        <Skeleton className="w-28 h-6" />
        <Skeleton className="w-full h-8 rounded-xl" />
        <div className="space-y-3 pt-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="w-9 h-9 rounded-full shrink-0" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="w-24 h-3.5" />
                <Skeleton className="w-36 h-3" />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="flex-1 h-full flex flex-col items-center justify-center p-8 text-center">
        <Skeleton className="w-12 h-12 rounded-2xl mb-3" />
        <Skeleton className="w-32 h-4" />
      </div>
    </div>
  );
}

export default function MessagesPage() {
  return (
    <Suspense fallback={<MessagesLoadingSkeleton />}>
      <MessagesWorkspace />
    </Suspense>
  );
}
