import React, { useState, useMemo } from 'react';
import { useChatStore } from '../../stores/chat.store';
import { ConversationItemRow } from './ConversationItemRow';
import { NewConversationModal } from './NewConversationModal';
import { Plus, Search, MessageSquarePlus } from 'lucide-react';
import { Skeleton } from '../ui/Skeleton';
import { Button } from '../ui/Button';
import { cn } from '../../lib/utils';

interface ConversationListProps {
  onSelectConversation: (id: string) => void;
}

export const ConversationList: React.FC<ConversationListProps> = ({
  onSelectConversation,
}) => {
  const {
    conversations,
    activeConversationId,
    isLoadingConversations,
    conversationFilter,
    setConversationFilter,
  } = useChatStore();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [localSearch, setLocalSearch] = useState('');

  // Calculate real category counts
  const dmCount = useMemo(
    () => conversations.filter((c) => c.type === 'DM').length,
    [conversations],
  );
  const groupCount = useMemo(
    () => conversations.filter((c) => c.type === 'GROUP').length,
    [conversations],
  );
  const allCount = conversations.length;

  // Filter conversations locally by search query
  const filteredConversations = useMemo(() => {
    let list = conversations;
    if (conversationFilter === 'dm') {
      list = list.filter((c) => c.type === 'DM');
    } else if (conversationFilter === 'group') {
      list = list.filter((c) => c.type === 'GROUP');
    }

    if (!localSearch.trim()) return list;

    const query = localSearch.toLowerCase();
    return list.filter((c) => {
      if (c.name && c.name.toLowerCase().includes(query)) return true;
      return c.members.some(
        (m) =>
          m.username.toLowerCase().includes(query) ||
          m.displayName.toLowerCase().includes(query),
      );
    });
  }, [conversations, conversationFilter, localSearch]);

  return (
    <div className="flex flex-col h-full bg-surface border-r border-border select-none">
      {/* Pane Header */}
      <div className="p-4 border-b border-border space-y-3 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h1 className="text-base font-bold text-primary tracking-tight">Messages</h1>
            {allCount > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-elevated border border-border text-[10px] font-semibold text-secondary">
                {allCount}
              </span>
            )}
          </div>

          <button
            onClick={() => setIsModalOpen(true)}
            className="w-8 h-8 rounded-xl bg-accent/15 hover:bg-accent text-accent-bright hover:text-white flex items-center justify-center transition-all duration-150 shadow-sm"
            title="Start new conversation"
            aria-label="Start new conversation"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-elevated/50 border border-border/60">
          <button
            type="button"
            onClick={() => setConversationFilter('all')}
            className={cn(
              'flex-1 py-1 px-2 rounded-lg text-[11px] font-semibold transition-all duration-150',
              conversationFilter === 'all'
                ? 'bg-accent text-white shadow-sm'
                : 'text-secondary hover:text-primary',
            )}
          >
            All ({allCount})
          </button>
          <button
            type="button"
            onClick={() => setConversationFilter('dm')}
            className={cn(
              'flex-1 py-1 px-2 rounded-lg text-[11px] font-semibold transition-all duration-150',
              conversationFilter === 'dm'
                ? 'bg-accent text-white shadow-sm'
                : 'text-secondary hover:text-primary',
            )}
          >
            DMs ({dmCount})
          </button>
          <button
            type="button"
            onClick={() => setConversationFilter('group')}
            className={cn(
              'flex-1 py-1 px-2 rounded-lg text-[11px] font-semibold transition-all duration-150',
              conversationFilter === 'group'
                ? 'bg-accent text-white shadow-sm'
                : 'text-secondary hover:text-primary',
            )}
          >
            Groups ({groupCount})
          </button>
        </div>

        {/* Search input */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Filter conversations..."
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            className="w-full h-8 pl-8 pr-3 rounded-xl bg-elevated border border-border text-xs text-primary placeholder:text-muted focus:outline-none focus:border-accent-bright transition-colors"
          />
        </div>
      </div>

      {/* Conversation Rows List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {isLoadingConversations && conversations.length === 0 ? (
          <div className="space-y-2 p-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-2.5">
                <Skeleton className="w-9 h-9 rounded-full shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="w-24 h-3.5" />
                  <Skeleton className="w-36 h-3" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredConversations.length > 0 ? (
          filteredConversations.map((conv) => (
            <ConversationItemRow
              key={conv.id}
              conversation={conv}
              isActive={conv.id === activeConversationId}
              onSelect={onSelectConversation}
            />
          ))
        ) : (
          <div className="py-12 px-4 text-center">
            <div className="w-12 h-12 rounded-2xl bg-accent/15 border border-accent/25 flex items-center justify-center text-accent-bright mx-auto mb-3">
              <MessageSquarePlus className="w-6 h-6" />
            </div>
            <h2 className="text-xs font-semibold text-primary">No conversations yet</h2>
            <p className="text-[11px] text-muted mt-1 leading-relaxed">
              Start a 1:1 direct message with someone or create a new group.
            </p>
            <Button
              variant="primary"
              size="sm"
              className="mt-4 gap-1.5"
              onClick={() => setIsModalOpen(true)}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Start Chat</span>
            </Button>
          </div>
        )}
      </div>

      {/* New Conversation Modal */}
      <NewConversationModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </div>
  );
};
