'use client';

import React, { useEffect, useState, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useCommunityStore } from '../../../stores/community.store';
import { ServerRail } from '../../../components/communities/ServerRail';
import { ChannelSidebar } from '../../../components/communities/ChannelSidebar';
import { ChannelChatArea } from '../../../components/communities/ChannelChatArea';
import { MembersPanel } from '../../../components/communities/MembersPanel';
import { CreateCommunityModal } from '../../../components/communities/CreateCommunityModal';
import { InviteModal } from '../../../components/communities/InviteModal';
import { ChannelModal } from '../../../components/communities/ChannelModal';
import { CommunitySettingsModal } from '../../../components/communities/CommunitySettingsModal';
import { ChannelItem } from '@chatterbox/shared';
import { Button } from '../../../components/ui/Button';
import { Users2, Compass, Plus, Loader2 } from 'lucide-react';

const EMPTY_CHANNELS: ChannelItem[] = [];
const EMPTY_MESSAGES: any[] = [];

function CommunitiesWorkspaceContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const queryCommunityId = searchParams.get('c');
  const queryChannelId = searchParams.get('ch');

  const communities = useCommunityStore((s) => s.communities);
  const activeCommunityId = useCommunityStore((s) => s.activeCommunityId);
  const activeCommunityDetail = useCommunityStore((s) => s.activeCommunityDetail);
  const activeChannelId = useCommunityStore((s) => s.activeChannelId);
  const messagesByChannelId = useCommunityStore((s) => s.messagesByChannelId);
  const isLoadingCommunities = useCommunityStore((s) => s.isLoadingCommunities);
  const isLoadingDetail = useCommunityStore((s) => s.isLoadingDetail);
  const isLoadingMessages = useCommunityStore((s) => s.isLoadingMessages);
  const isMembersPanelOpen = useCommunityStore((s) => s.isMembersPanelOpen);

  const fetchMyCommunities = useCommunityStore((s) => s.fetchMyCommunities);
  const selectCommunity = useCommunityStore((s) => s.selectCommunity);
  const selectChannel = useCommunityStore((s) => s.selectChannel);
  const toggleMembersPanel = useCommunityStore((s) => s.toggleMembersPanel);
  const setMembersPanelOpen = useCommunityStore((s) => s.setMembersPanelOpen);
  const initSocketListeners = useCommunityStore((s) => s.initSocketListeners);
  const cleanupSocketListeners = useCommunityStore((s) => s.cleanupSocketListeners);

  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [isChannelModalOpen, setIsChannelModalOpen] = useState(false);
  const [channelToEdit, setChannelToEdit] = useState<ChannelItem | null>(null);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [communitiesError, setCommunitiesError] = useState<string | null>(null);

  // Initial load & socket binding
  useEffect(() => {
    initSocketListeners();
    fetchMyCommunities().catch((err: any) => {
      setCommunitiesError(err?.message || 'Failed to load communities.');
    });

    return () => {
      // Emit channel:leave & clean socket listeners on unmount
      cleanupSocketListeners();
    };
  }, [initSocketListeners, fetchMyCommunities, cleanupSocketListeners]);

  // Synchronize ?c=<id> and ?ch=<id> query params with store without fighting router.replace
  const pendingNavRef = useRef<{ c: string | null; ch: string | null } | null>(null);

  useEffect(() => {
    if (pendingNavRef.current) {
      const target = pendingNavRef.current;
      if (
        queryCommunityId === target.c &&
        (target.ch === null || queryChannelId === target.ch)
      ) {
        pendingNavRef.current = null;
      } else {
        return;
      }
    }

    const currentCommunityId = useCommunityStore.getState().activeCommunityId;
    const currentChannelId = useCommunityStore.getState().activeChannelId;

    if (queryCommunityId) {
      if (queryCommunityId !== currentCommunityId) {
        selectCommunity(queryCommunityId, queryChannelId || undefined).catch((err: any) => {
          setCommunitiesError(err?.message || 'Failed to load community.');
        });
      } else if (queryChannelId && queryChannelId !== currentChannelId) {
        selectChannel(queryChannelId).catch((err: any) => {
          setCommunitiesError(err?.message || 'Failed to load channel messages.');
        });
      }
    } else if (communities.length > 0 && !currentCommunityId && !isLoadingCommunities) {
      const first = communities[0];
      pendingNavRef.current = { c: first.id, ch: null };
      selectCommunity(first.id).catch((err: any) => {
        setCommunitiesError(err?.message || 'Failed to load community.');
      });
      router.replace(`/communities?c=${first.id}`, { scroll: false });
    }
  }, [
    queryCommunityId,
    queryChannelId,
    communities,
    isLoadingCommunities,
    selectCommunity,
    selectChannel,
    router,
  ]);

  const handleSelectCommunity = (commId: string) => {
    pendingNavRef.current = { c: commId, ch: null };
    selectCommunity(commId).catch((err: any) => {
      setCommunitiesError(err?.message || 'Failed to load community.');
    });
    router.replace(`/communities?c=${commId}`, { scroll: false });
  };

  const handleSelectChannel = (channelId: string) => {
    const currentCommId = useCommunityStore.getState().activeCommunityId;
    if (currentCommId) {
      pendingNavRef.current = { c: currentCommId, ch: channelId };
    }
    selectChannel(channelId).catch((err: any) => {
      setCommunitiesError(err?.message || 'Failed to load channel messages.');
    });
    if (currentCommId) {
      router.replace(`/communities?c=${currentCommId}&ch=${channelId}`, { scroll: false });
    }
  };

  const activeChannel = activeCommunityDetail?.channels?.find((c) => c.id === activeChannelId);
  const currentMessages = activeChannelId ? messagesByChannelId[activeChannelId] || EMPTY_MESSAGES : EMPTY_MESSAGES;

  return (
    <div className="flex h-full w-full overflow-hidden bg-canvas">
      {/* 1. Server Rail (64px) */}
      <ServerRail
        communities={communities}
        activeCommunityId={activeCommunityId}
        onSelectCommunity={handleSelectCommunity}
        onOpenCreateModal={() => setIsCreateModalOpen(true)}
      />

      {/* Main Workspace Body */}
      {communitiesError && communities.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <p className="text-sm font-semibold text-status-busy mb-2">{communitiesError}</p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setCommunitiesError(null);
              fetchMyCommunities().catch((err: any) => {
                setCommunitiesError(err?.message || 'Failed to load communities.');
              });
            }}
          >
            Retry
          </Button>
        </div>
      ) : isLoadingCommunities && communities.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <Loader2 className="w-8 h-8 text-accent animate-spin mb-3" />
          <p className="text-xs text-secondary">Loading your communities...</p>
        </div>
      ) : communities.length === 0 ? (
        /* Empty State: User belongs to no communities yet */
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <div className="w-16 h-16 rounded-3xl bg-accent/15 border border-accent/30 flex items-center justify-center text-accent-bright shadow-neon mb-4">
            <Users2 className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-primary">No Communities Joined Yet</h2>
          <p className="text-xs text-secondary mt-2 max-w-sm leading-relaxed">
            Create your own community server with custom text and announcement channels, or discover public
            communities to join discussions.
          </p>
          <div className="mt-6 flex items-center gap-3">
            <Button
              variant="primary"
              size="md"
              onClick={() => setIsCreateModalOpen(true)}
              className="flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Create Community
            </Button>
            <Button
              variant="secondary"
              size="md"
              onClick={() => router.push('/discover')}
              className="flex items-center gap-2"
            >
              <Compass className="w-4 h-4" />
              Discover Public Spaces
            </Button>
          </div>
        </div>
      ) : activeCommunityDetail ? (
        <>
          {/* 2. Channel Sidebar (240px) */}
          <ChannelSidebar
            community={activeCommunityDetail}
            activeChannelId={activeChannelId}
            onSelectChannel={handleSelectChannel}
            onOpenInviteModal={() => setIsInviteModalOpen(true)}
            onOpenChannelModal={(ch) => {
              setChannelToEdit(ch || null);
              setIsChannelModalOpen(true);
            }}
            onOpenSettingsModal={() => setIsSettingsModalOpen(true)}
          />

          {/* 3. Center Channel Chat Area */}
          {activeChannel ? (
            <ChannelChatArea
              community={activeCommunityDetail}
              channel={activeChannel}
              messages={currentMessages}
              isLoadingMessages={isLoadingMessages}
              onToggleMembers={toggleMembersPanel}
              isMembersOpen={isMembersPanelOpen}
            />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-secondary text-xs">
              Select or create a channel to begin chatting.
            </div>
          )}

          {/* 4. Right Members Panel (240px, collapsible) */}
          <MembersPanel
            community={activeCommunityDetail}
            isOpen={isMembersPanelOpen}
            onClose={() => setMembersPanelOpen(false)}
          />
        </>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <Loader2 className="w-8 h-8 text-accent animate-spin mb-2" />
          <p className="text-xs text-secondary">Loading community...</p>
        </div>
      )}

      {/* Modals */}
      <CreateCommunityModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
      />

      {activeCommunityDetail && (
        <>
          <InviteModal
            isOpen={isInviteModalOpen}
            communityId={activeCommunityDetail.id}
            communityName={activeCommunityDetail.name}
            onClose={() => setIsInviteModalOpen(false)}
          />

          <ChannelModal
            isOpen={isChannelModalOpen}
            communityId={activeCommunityDetail.id}
            channel={channelToEdit}
            onClose={() => {
              setIsChannelModalOpen(false);
              setChannelToEdit(null);
            }}
          />

          <CommunitySettingsModal
            isOpen={isSettingsModalOpen}
            community={activeCommunityDetail}
            onClose={() => setIsSettingsModalOpen(false)}
          />
        </>
      )}
    </div>
  );
}

export default function CommunitiesPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-xs text-secondary">Loading workspace...</div>}>
      <CommunitiesWorkspaceContent />
    </Suspense>
  );
}
