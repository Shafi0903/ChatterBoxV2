import { create } from 'zustand';
import {
  CallItem,
  CallType,
  SocketEvents,
  CallIncomingPayload,
  CallAcceptedPayload,
  CallRejectedPayload,
  CallEndedPayload,
  CallBusyPayload,
  CallOfferPayload,
  CallAnswerPayload,
  CallIceCandidatePayload,
} from '@chatterbox/shared';
import { api } from '../lib/api';
import { getSocket } from '../lib/socket';
import { webrtcManager } from '../lib/webrtcManager';
import { startRingtone, stopRingtone } from '../lib/ringtone';

export type CallStatusState = 'idle' | 'outgoing' | 'incoming' | 'connecting' | 'active';

interface CallState {
  status: CallStatusState;
  activeCall: CallItem | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isMuted: boolean;
  isCameraOff: boolean;
  isScreenSharing: boolean;
  isMinimized: boolean;
  callError: string | null;
  connectedAt: Date | null;

  // Actions
  initiateCall: (conversationId: string, type: CallType) => Promise<void>;
  acceptIncomingCall: () => Promise<void>;
  rejectIncomingCall: () => Promise<void>;
  endCall: () => Promise<void>;
  toggleMute: () => void;
  toggleCamera: () => void;
  toggleScreenShare: () => Promise<void>;
  toggleMinimize: () => void;
  resetCallState: () => void;
  initSocketListeners: () => void;
}

export const useCallStore = create<CallState>((set, get) => ({
  status: 'idle',
  activeCall: null,
  localStream: null,
  remoteStream: null,
  isMuted: false,
  isCameraOff: false,
  isScreenSharing: false,
  isMinimized: false,
  callError: null,
  connectedAt: null,

  initSocketListeners: () => {
    const socket = getSocket();
    if (!socket) return;

    // Remove prior listeners for React 19 StrictMode safety
    socket.off(SocketEvents.CALL_INCOMING);
    socket.off(SocketEvents.CALL_ACCEPTED);
    socket.off(SocketEvents.CALL_REJECTED);
    socket.off(SocketEvents.CALL_ENDED);
    socket.off(SocketEvents.CALL_BUSY);
    socket.off(SocketEvents.CALL_OFFER);
    socket.off(SocketEvents.CALL_ANSWER);
    socket.off(SocketEvents.CALL_ICE_CANDIDATE);

    // 1. Incoming Call
    socket.on(SocketEvents.CALL_INCOMING, (payload: CallIncomingPayload) => {
      const currentStatus = get().status;
      if (currentStatus !== 'idle') {
        // Busy with another call
        return;
      }

      set({
        status: 'incoming',
        activeCall: payload.call,
        callError: null,
        isMinimized: false,
      });

      startRingtone();
    });

    // 2. Call Accepted
    socket.on(SocketEvents.CALL_ACCEPTED, async (payload: CallAcceptedPayload) => {
      const { status, activeCall } = get();
      stopRingtone();

      if (!activeCall || activeCall.id !== payload.callId) {
        // Multi-tab sync: If accepted on another tab while ringing here, reset
        if (status === 'incoming') {
          get().resetCallState();
        }
        return;
      }

      // If caller, callee accepted -> send WebRTC offer
      if (status === 'outgoing') {
        set({ status: 'connecting' });
        try {
          await webrtcManager.createAndSendOffer(activeCall.id);
        } catch (err: any) {
          set({ callError: err.message });
          get().endCall();
        }
      }
    });

    // 3. Call Rejected
    socket.on(SocketEvents.CALL_REJECTED, (payload: CallRejectedPayload) => {
      const { activeCall } = get();
      stopRingtone();

      if (activeCall && activeCall.id === payload.callId) {
        webrtcManager.cleanup();
        set({
          status: 'idle',
          activeCall: null,
          localStream: null,
          remoteStream: null,
          callError: 'Call was declined',
        });
        setTimeout(() => set({ callError: null }), 4000);
      } else {
        // Multi-tab dismiss
        get().resetCallState();
      }
    });

    // 4. Call Ended
    socket.on(SocketEvents.CALL_ENDED, (payload: CallEndedPayload) => {
      const { activeCall } = get();
      stopRingtone();

      if (activeCall && activeCall.id === payload.callId) {
        webrtcManager.cleanup();
        const reasonMsg =
          payload.reason === 'missed'
            ? 'Call missed'
            : payload.reason === 'canceled'
            ? 'Call canceled'
            : payload.reason === 'disconnected'
            ? 'Peer disconnected'
            : null;

        set({
          status: 'idle',
          activeCall: null,
          localStream: null,
          remoteStream: null,
          isScreenSharing: false,
          isMinimized: false,
          callError: reasonMsg,
        });

        if (reasonMsg) {
          setTimeout(() => set({ callError: null }), 4000);
        }
      } else {
        get().resetCallState();
      }
    });

    // 5. Call Busy
    socket.on(SocketEvents.CALL_BUSY, (payload: CallBusyPayload) => {
      stopRingtone();
      webrtcManager.cleanup();
      set({
        status: 'idle',
        activeCall: null,
        localStream: null,
        remoteStream: null,
        callError: payload.reason || 'User is currently busy on another call',
      });
      setTimeout(() => set({ callError: null }), 4000);
    });

    // 6. SDP Offer (Callee receives caller's offer)
    socket.on(SocketEvents.CALL_OFFER, async (payload: CallOfferPayload) => {
      const { activeCall } = get();
      if (!activeCall || activeCall.id !== payload.callId) return;

      try {
        await webrtcManager.handleRemoteOfferAndAnswer(activeCall.id, payload.sdp as any);
      } catch (err: any) {
        set({ callError: `Failed to process call offer: ${err.message}` });
        get().endCall();
      }
    });

    // 7. SDP Answer (Caller receives callee's answer)
    socket.on(SocketEvents.CALL_ANSWER, async (payload: CallAnswerPayload) => {
      const { activeCall } = get();
      if (!activeCall || activeCall.id !== payload.callId) return;

      try {
        await webrtcManager.handleRemoteAnswer(payload.sdp as any);
      } catch (err: any) {
        set({ callError: `Failed to process call answer: ${err.message}` });
        get().endCall();
      }
    });

    // 8. ICE Candidate Relay
    socket.on(SocketEvents.CALL_ICE_CANDIDATE, async (payload: CallIceCandidatePayload) => {
      const { activeCall } = get();
      if (!activeCall || activeCall.id !== payload.callId) return;

      await webrtcManager.addIceCandidate(payload.candidate);
    });
  },

  /**
   * Initiates a 1:1 call from a DM.
   */
  initiateCall: async (conversationId: string, type: CallType) => {
    const socket = getSocket();
    if (!socket?.connected) {
      set({ callError: 'Unable to start call: Chat server disconnected' });
      return;
    }

    try {
      set({
        status: 'outgoing',
        callError: null,
        isMuted: false,
        isCameraOff: false,
        isScreenSharing: false,
        isMinimized: false,
      });

      // 1. Fetch ICE servers
      const { iceServers } = await api.getIceServers();

      // 2. Acquire local media
      const localStream = await webrtcManager.acquireLocalMedia(type);
      set({ localStream });

      // 3. Emit initiate call to API
      const res: any = await new Promise((resolve) => {
        socket.emit(SocketEvents.CALL_INITIATE, { conversationId, type }, resolve);
      });

      if (!res.ok) {
        // Adjustment 3: Clean up media immediately on busy or failure
        webrtcManager.cleanup();
        set({
          status: 'idle',
          activeCall: null,
          localStream: null,
          callError: res.busy ? 'User is busy in another call' : res.error || 'Failed to start call',
        });
        setTimeout(() => set({ callError: null }), 4000);
        return;
      }

      set({ activeCall: res.call });

      // 4. Initialize PeerConnection and attach callbacks
      webrtcManager.setCallbacks({
        onRemoteStream: (remoteStream) => {
          set({ remoteStream });
        },
        onConnectionStateChange: (state) => {
          if (state === 'connected') {
            set({ status: 'active', connectedAt: new Date() });
          } else if (state === 'failed' || state === 'disconnected') {
            // Managed by socket call:ended or reconnect
          }
        },
        onScreenShareEnded: () => {
          set({ isScreenSharing: false });
        },
      });

      webrtcManager.initConnection(res.call.id, iceServers);
    } catch (err: any) {
      webrtcManager.cleanup();
      set({
        status: 'idle',
        activeCall: null,
        localStream: null,
        callError: err.message || 'Failed to start call',
      });
      setTimeout(() => set({ callError: null }), 4000);
    }
  },

  /**
   * Accepts an incoming ringing call.
   * Adjustment 1: Fetch ICE servers, acquire local media, and init PC BEFORE emitting call:accept.
   */
  acceptIncomingCall: async () => {
    stopRingtone();
    const { activeCall } = get();
    const socket = getSocket();

    if (!activeCall || !socket?.connected) {
      get().resetCallState();
      return;
    }

    try {
      set({ status: 'connecting', callError: null });

      // 1. Fetch ICE servers
      const { iceServers } = await api.getIceServers();

      // 2. Acquire local media
      const localStream = await webrtcManager.acquireLocalMedia(activeCall.type);
      set({ localStream });

      // 3. Initialize RTCPeerConnection and bind local stream
      webrtcManager.setCallbacks({
        onRemoteStream: (remoteStream) => {
          set({ remoteStream });
        },
        onConnectionStateChange: (state) => {
          if (state === 'connected') {
            set({ status: 'active', connectedAt: new Date() });
          }
        },
        onScreenShareEnded: () => {
          set({ isScreenSharing: false });
        },
      });

      webrtcManager.initConnection(activeCall.id, iceServers);

      // 4. Emit call:accept to API now that callee is ready
      const ack: any = await new Promise((resolve) => {
        socket.emit(SocketEvents.CALL_ACCEPT, { callId: activeCall.id }, resolve);
      });

      if (!ack.ok) {
        throw new Error(ack.error || 'Failed to accept call');
      }
    } catch (err: any) {
      stopRingtone();
      webrtcManager.cleanup();
      set({
        status: 'idle',
        activeCall: null,
        localStream: null,
        callError: err.message || 'Failed to connect call',
      });
      setTimeout(() => set({ callError: null }), 4000);
    }
  },

  /**
   * Rejects an incoming call.
   */
  rejectIncomingCall: async () => {
    stopRingtone();
    const { activeCall } = get();
    const socket = getSocket();

    if (activeCall && socket?.connected) {
      socket.emit(SocketEvents.CALL_REJECT, { callId: activeCall.id });
    }

    get().resetCallState();
  },

  /**
   * Hangs up or cancels an active/ringing call.
   */
  endCall: async () => {
    stopRingtone();
    const { activeCall } = get();
    const socket = getSocket();

    if (activeCall && socket?.connected) {
      socket.emit(SocketEvents.CALL_END, { callId: activeCall.id });
    }

    get().resetCallState();
  },

  toggleMute: () => {
    const isMuted = !get().isMuted;
    webrtcManager.toggleMute(isMuted);
    set({ isMuted });
  },

  toggleCamera: () => {
    const isCameraOff = !get().isCameraOff;
    webrtcManager.toggleCamera(isCameraOff);
    set({ isCameraOff });
  },

  toggleScreenShare: async () => {
    const isSharing = get().isScreenSharing;
    if (isSharing) {
      await webrtcManager.stopScreenShare();
      set({ isScreenSharing: false });
    } else {
      try {
        await webrtcManager.startScreenShare();
        set({ isScreenSharing: true });
      } catch (err: any) {
        set({ callError: err.message || 'Failed to share screen' });
        setTimeout(() => set({ callError: null }), 4000);
      }
    }
  },

  toggleMinimize: () => {
    set((s) => ({ isMinimized: !s.isMinimized }));
  },

  resetCallState: () => {
    stopRingtone();
    webrtcManager.cleanup();
    set({
      status: 'idle',
      activeCall: null,
      localStream: null,
      remoteStream: null,
      isMuted: false,
      isCameraOff: false,
      isScreenSharing: false,
      isMinimized: false,
      connectedAt: null,
    });
  },
}));
