'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useCallStore } from '../../stores/call.store';
import { useAuthStore } from '../../stores/auth.store';
import { Avatar } from '../ui/Avatar';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  ScreenShare,
  PhoneOff,
  Minimize2,
  Maximize2,
  ShieldCheck,
} from 'lucide-react';
import { cn } from '../../lib/utils';

export const ActiveCallOverlay: React.FC = () => {
  const {
    status,
    activeCall,
    localStream,
    remoteStream,
    isMuted,
    isCameraOff,
    isScreenSharing,
    isMinimized,
    connectedAt,
    toggleMute,
    toggleCamera,
    toggleScreenShare,
    toggleMinimize,
    endCall,
  } = useCallStore();

  const currentUserId = useAuthStore((s) => s.user?.id);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);

  // Live MM:SS timer
  const [durationSec, setDurationSec] = useState(0);

  useEffect(() => {
    if (!connectedAt || status !== 'active') {
      setDurationSec(0);
      return;
    }

    const interval = setInterval(() => {
      const now = Date.now();
      const diff = Math.max(0, Math.floor((now - new Date(connectedAt).getTime()) / 1000));
      setDurationSec(diff);
    }, 1000);

    return () => clearInterval(interval);
  }, [connectedAt, status]);

  // Adjustment 2: Bind remote audio stream strictly in useEffect and keep mounted
  useEffect(() => {
    if (remoteAudioRef.current && remoteStream) {
      remoteAudioRef.current.srcObject = remoteStream;
      remoteAudioRef.current.play().catch(() => {});
    }
  }, [remoteStream]);

  // Bind local video stream
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
      localVideoRef.current.play().catch(() => {});
    }
  }, [localStream, isMinimized]);

  // Bind remote video stream
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
      remoteVideoRef.current.play().catch(() => {});
    }
  }, [remoteStream, isMinimized]);

  if (status === 'idle' || status === 'incoming' || !activeCall) {
    return null;
  }

  const isVideo = activeCall.type === 'VIDEO';
  const isCaller = activeCall.callerId === currentUserId;
  const peer = isCaller ? activeCall.callee : activeCall.caller;

  const formatTimer = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <>
      {/* Persistent Hidden Remote Audio Element (never unmounted so audio continues during minimize) */}
      <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />

      {/* 1. Minimized Mini-Bar Mode */}
      {isMinimized ? (
        <div className="fixed top-20 right-6 z-50 flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-surface/95 border border-accent/30 shadow-2xl backdrop-blur-lg animate-fade-in select-none">
          <Avatar
            name={peer.displayName || peer.username}
            src={peer.avatarUrl}
            size="sm"
          />
          <div className="flex flex-col">
            <span className="text-xs font-semibold text-primary max-w-[120px] truncate">
              {peer.displayName || peer.username}
            </span>
            <span className="text-[10px] text-emerald-400 font-mono font-medium">
              {status === 'active' ? formatTimer(durationSec) : status === 'connecting' ? 'Connecting...' : 'Calling...'}
            </span>
          </div>

          <div className="flex items-center gap-1.5 ml-2">
            {/* Mute Button */}
            <button
              type="button"
              onClick={toggleMute}
              className={cn(
                'p-2 rounded-xl transition-colors',
                isMuted
                  ? 'bg-rose-500/20 text-rose-400 hover:bg-rose-500/30'
                  : 'bg-elevated text-secondary hover:text-primary hover:bg-surface-hover',
              )}
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
            </button>

            {/* Expand Button */}
            <button
              type="button"
              onClick={toggleMinimize}
              className="p-2 rounded-xl bg-elevated text-secondary hover:text-primary hover:bg-surface-hover transition-colors"
              title="Expand Call"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>

            {/* Hang Up Button */}
            <button
              type="button"
              onClick={endCall}
              className="p-2 rounded-xl bg-rose-500 hover:bg-rose-600 text-white shadow-md transition-colors"
              title="End Call"
            >
              <PhoneOff className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ) : (
        /* 2. Full-Screen / Expanded View */
        <div className="fixed inset-0 z-50 flex flex-col bg-canvas/95 backdrop-blur-2xl animate-fade-in select-none">
          {/* Header Bar */}
          <div className="h-16 px-6 flex items-center justify-between border-b border-border/40 shrink-0">
            <div className="flex items-center gap-3">
              <Avatar
                name={peer.displayName || peer.username}
                src={peer.avatarUrl}
                size="md"
              />
              <div className="flex flex-col">
                <h2 className="text-sm font-bold text-primary">
                  {peer.displayName || peer.username}
                </h2>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-emerald-400 font-mono font-medium">
                    {status === 'active' ? formatTimer(durationSec) : status === 'connecting' ? 'Connecting...' : 'Calling...'}
                  </span>
                  <span className="text-border">•</span>
                  <div className="inline-flex items-center gap-1 text-[11px] text-muted">
                    <ShieldCheck className="w-3 h-3 text-emerald-400" />
                    <span>Secured with WebRTC DTLS-SRTP</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Minimize Button */}
            <button
              type="button"
              onClick={toggleMinimize}
              className="p-2 rounded-xl text-secondary hover:text-primary hover:bg-surface-hover transition-colors"
              title="Minimize (Keep chatting)"
            >
              <Minimize2 className="w-5 h-5" />
            </button>
          </div>

          {/* Call Stage Area */}
          <div className="flex-1 relative flex items-center justify-center p-6 overflow-hidden">
            {isVideo ? (
              /* Video Call View */
              <div className="relative w-full h-full max-w-5xl rounded-3xl overflow-hidden bg-black/60 border border-border/40 flex items-center justify-center shadow-2xl">
                {/* Remote Video Stream */}
                {remoteStream && remoteStream.getVideoTracks().length > 0 ? (
                  <video
                    ref={remoteVideoRef}
                    autoPlay
                    playsInline
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-3 text-center">
                    <Avatar
                      name={peer.displayName || peer.username}
                      src={peer.avatarUrl}
                      size="lg"
                    />
                    <p className="text-sm font-medium text-secondary">
                      {status === 'active' ? `${peer.displayName || peer.username}'s camera is off` : 'Waiting for connection...'}
                    </p>
                  </div>
                )}

                {/* Local Camera Floating PiP Frame */}
                <div className="absolute bottom-4 right-4 w-40 sm:w-52 aspect-video rounded-2xl bg-surface/90 border border-border shadow-2xl overflow-hidden z-10 flex items-center justify-center">
                  {!isCameraOff && localStream && localStream.getVideoTracks().length > 0 ? (
                    <video
                      ref={localVideoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover transform -scale-x-100"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center gap-1 text-center p-2">
                      <VideoOff className="w-5 h-5 text-muted" />
                      <span className="text-[10px] text-muted font-medium">Camera Off</span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* Audio Call View */
              <div className="flex flex-col items-center justify-center gap-6 text-center">
                <div className="relative flex items-center justify-center">
                  {status === 'active' && (
                    <div className="absolute w-36 h-36 rounded-full bg-accent/20 animate-ping" />
                  )}
                  <div className="relative">
                    <Avatar
                      name={peer.displayName || peer.username}
                      src={peer.avatarUrl}
                      size="lg"
                    />
                  </div>
                </div>

                <div className="flex flex-col items-center gap-1.5">
                  <h3 className="text-xl font-bold text-primary">
                    {peer.displayName || peer.username}
                  </h3>
                  <p className="text-xs text-muted">@{peer.username}</p>
                  <p className="text-sm font-mono text-emerald-400 mt-2 font-medium">
                    {status === 'active' ? formatTimer(durationSec) : status === 'connecting' ? 'Connecting audio stream...' : 'Calling peer...'}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Bottom Control Bar */}
          <div className="h-24 px-6 flex items-center justify-center gap-4 shrink-0 border-t border-border/40">
            {/* Mic Mute */}
            <button
              type="button"
              onClick={toggleMute}
              className={cn(
                'w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-150 shadow-md',
                isMuted
                  ? 'bg-rose-500/20 border border-rose-500/40 text-rose-400'
                  : 'bg-elevated hover:bg-surface-hover border border-border text-primary',
              )}
              title={isMuted ? 'Unmute Microphone' : 'Mute Microphone'}
            >
              {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </button>

            {/* Video Toggle (Video Calls only) */}
            {isVideo && (
              <button
                type="button"
                onClick={toggleCamera}
                className={cn(
                  'w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-150 shadow-md',
                  isCameraOff
                    ? 'bg-rose-500/20 border border-rose-500/40 text-rose-400'
                    : 'bg-elevated hover:bg-surface-hover border border-border text-primary',
                )}
                title={isCameraOff ? 'Turn Camera On' : 'Turn Camera Off'}
              >
                {isCameraOff ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
              </button>
            )}

            {/* Screen Share (Video Calls only) */}
            {isVideo && (
              <button
                type="button"
                onClick={toggleScreenShare}
                className={cn(
                  'w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-150 shadow-md',
                  isScreenSharing
                    ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-400'
                    : 'bg-elevated hover:bg-surface-hover border border-border text-primary',
                )}
                title={isScreenSharing ? 'Stop Screen Share' : 'Share Screen'}
              >
                <ScreenShare className="w-5 h-5" />
              </button>
            )}

            {/* End Call / Hang Up */}
            <button
              type="button"
              onClick={endCall}
              className="w-14 h-12 rounded-2xl bg-rose-500 hover:bg-rose-600 text-white flex items-center justify-center shadow-lg shadow-rose-500/25 transition-transform hover:scale-105 active:scale-95"
              title="Hang Up"
            >
              <PhoneOff className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </>
  );
};
