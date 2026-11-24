'use client';

import React from 'react';
import { useCallStore } from '../../stores/call.store';
import { Avatar } from '../ui/Avatar';
import { Phone, PhoneOff, Video } from 'lucide-react';

export const IncomingCallModal: React.FC = () => {
  const { status, activeCall, acceptIncomingCall, rejectIncomingCall } = useCallStore();

  if (status !== 'incoming' || !activeCall) {
    return null;
  }

  const caller = activeCall.caller;
  const isVideo = activeCall.type === 'VIDEO';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-fade-in select-none">
      <div className="relative w-full max-w-sm rounded-3xl bg-surface/95 border border-border shadow-2xl p-6 flex flex-col items-center text-center overflow-hidden">
        {/* Ambient Top Glow */}
        <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-accent via-emerald-500 to-accent-bright" />

        {/* Pulsing Avatar Ring */}
        <div className="relative my-4 flex items-center justify-center">
          <div className="absolute w-24 h-24 rounded-full bg-emerald-500/20 animate-ping" />
          <div className="relative">
            <Avatar
              name={caller.displayName || caller.username}
              src={caller.avatarUrl}
              size="lg"
            />
          </div>
        </div>

        {/* Caller Info */}
        <h3 className="text-lg font-bold text-primary mt-2">
          {caller.displayName || caller.username}
        </h3>
        <p className="text-xs text-muted mt-0.5">@{caller.username}</p>

        {/* Badge */}
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-accent/15 border border-accent/25 text-accent-bright text-xs font-semibold mt-4">
          {isVideo ? <Video className="w-3.5 h-3.5" /> : <Phone className="w-3.5 h-3.5" />}
          <span>Incoming {isVideo ? 'Video' : 'Voice'} Call</span>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-center gap-6 mt-8 w-full">
          {/* Decline Button */}
          <div className="flex flex-col items-center gap-1.5">
            <button
              type="button"
              onClick={rejectIncomingCall}
              className="w-14 h-14 rounded-full bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-400 flex items-center justify-center shadow-lg transition-transform hover:scale-105 active:scale-95"
              title="Decline Call"
            >
              <PhoneOff className="w-6 h-6" />
            </button>
            <span className="text-[11px] font-medium text-muted">Decline</span>
          </div>

          {/* Accept Button */}
          <div className="flex flex-col items-center gap-1.5">
            <button
              type="button"
              onClick={acceptIncomingCall}
              className="w-14 h-14 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white flex items-center justify-center shadow-lg shadow-emerald-500/30 transition-transform hover:scale-105 active:scale-95 animate-pulse"
              title="Accept Call"
            >
              <Phone className="w-6 h-6" />
            </button>
            <span className="text-[11px] font-medium text-emerald-400 font-semibold">Accept</span>
          </div>
        </div>
      </div>
    </div>
  );
};
