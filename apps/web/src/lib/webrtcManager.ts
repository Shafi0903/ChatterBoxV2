import { IceServerConfig, SocketEvents, CallType } from '@chatterbox/shared';
import { getSocket } from './socket';

export class WebRTCManager {
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private screenStream: MediaStream | null = null;
  private activeVideoSender: RTCRtpSender | null = null;
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private callId: string | null = null;

  private onRemoteStreamCb: ((stream: MediaStream) => void) | null = null;
  private onConnectionStateChangeCb: ((state: RTCPeerConnectionState) => void) | null = null;
  private onScreenShareEndedCb: (() => void) | null = null;

  public setCallbacks(callbacks: {
    onRemoteStream: (stream: MediaStream) => void;
    onConnectionStateChange: (state: RTCPeerConnectionState) => void;
    onScreenShareEnded?: () => void;
  }) {
    this.onRemoteStreamCb = callbacks.onRemoteStream;
    this.onConnectionStateChangeCb = callbacks.onConnectionStateChange;
    this.onScreenShareEndedCb = callbacks.onScreenShareEnded || null;
  }

  /**
   * Updates the active call ID once the server acknowledges call initiation.
   */
  public setCallId(callId: string): void {
    this.callId = callId;
  }

  /**
   * Initializes RTCPeerConnection with configured ICE servers.
   */
  public initConnection(callId: string, iceServers: IceServerConfig[]): RTCPeerConnection {
    if (typeof window === 'undefined') {
      throw new Error('WebRTC is only supported in browser environments');
    }

    this.cleanup();
    this.callId = callId;

    const config: RTCConfiguration = {
      iceServers: iceServers.length > 0 ? iceServers : [{ urls: 'stun:stun.l.google.com:19302' }],
      iceCandidatePoolSize: 10,
    };

    const pc = new RTCPeerConnection(config);
    this.peerConnection = pc;

    // ICE Candidate handler -> emit to server
    pc.onicecandidate = (event) => {
      if (event.candidate && this.callId && this.callId !== 'pending') {
        const socket = getSocket();
        if (socket?.connected) {
          socket.emit(SocketEvents.CALL_ICE_CANDIDATE, {
            callId: this.callId,
            candidate: event.candidate.toJSON(),
          });
        }
      }
    };

    // Remote Track handler
    pc.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        this.remoteStream = event.streams[0];
      } else {
        if (!this.remoteStream) {
          this.remoteStream = new MediaStream();
        }
        this.remoteStream.addTrack(event.track);
      }

      if (this.onRemoteStreamCb && this.remoteStream) {
        this.onRemoteStreamCb(this.remoteStream);
      }
    };

    // Connection state change
    pc.onconnectionstatechange = () => {
      if (this.onConnectionStateChangeCb && pc.connectionState) {
        this.onConnectionStateChangeCb(pc.connectionState);
      }
    };

    return pc;
  }

  /**
   * Acquires local media stream according to call type.
   */
  public async acquireLocalMedia(type: CallType): Promise<MediaStream> {
    if (typeof window === 'undefined') {
      throw new Error('WebRTC is only supported in browser environments');
    }

    if (
      !window.isSecureContext &&
      window.location.hostname !== 'localhost' &&
      window.location.hostname !== '127.0.0.1'
    ) {
      throw new Error(
        'Audio/Video calls require a secure HTTPS connection or localhost (browser WebRTC media constraint).'
      );
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error(
        'Camera and microphone access is unavailable in this browser or disabled under non-HTTPS origin.'
      );
    }

    const constraints: MediaStreamConstraints = {
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video:
        type === 'VIDEO'
          ? {
              width: { ideal: 1280 },
              height: { ideal: 720 },
              facingMode: 'user',
            }
          : false,
    };

    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.localStream = stream;

      // Add tracks to PeerConnection if already initialized
      if (this.peerConnection) {
        stream.getTracks().forEach((track) => {
          this.peerConnection?.addTrack(track, stream);
        });
      }

      return stream;
    } catch (err: any) {
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        throw new Error('Microphone or Camera permission was denied. Please allow access in your browser site permissions.');
      }
      if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        throw new Error('No compatible microphone or camera found on this device.');
      }
      throw new Error(`Failed to access media devices: ${err.message}`);
    }
  }

  /**
   * Caller initiates SDP offer after callee accepts.
   */
  public async createAndSendOffer(callId: string): Promise<void> {
    if (!this.peerConnection) return;

    this.callId = callId;
    const offer = await this.peerConnection.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: true,
    });

    await this.peerConnection.setLocalDescription(offer);

    const socket = getSocket();
    if (socket?.connected) {
      socket.emit(SocketEvents.CALL_OFFER, {
        callId,
        sdp: {
          type: offer.type,
          sdp: offer.sdp,
        },
      });
    }
  }

  /**
   * Callee handles remote offer and generates SDP answer.
   */
  public async handleRemoteOfferAndAnswer(callId: string, sdp: RTCSessionDescriptionInit): Promise<void> {
    if (!this.peerConnection) return;

    this.callId = callId;
    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(sdp));
    await this.flushPendingCandidates();

    const answer = await this.peerConnection.createAnswer();
    await this.peerConnection.setLocalDescription(answer);

    const socket = getSocket();
    if (socket?.connected) {
      socket.emit(SocketEvents.CALL_ANSWER, {
        callId,
        sdp: {
          type: answer.type,
          sdp: answer.sdp,
        },
      });
    }
  }

  /**
   * Caller sets remote answer from callee.
   */
  public async handleRemoteAnswer(sdp: RTCSessionDescriptionInit): Promise<void> {
    if (!this.peerConnection) return;

    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(sdp));
    await this.flushPendingCandidates();
  }

  /**
   * Queues or adds incoming remote ICE candidate.
   */
  public async addIceCandidate(candidateInit: RTCIceCandidateInit): Promise<void> {
    if (!this.peerConnection || !this.peerConnection.remoteDescription) {
      this.pendingCandidates.push(candidateInit);
      return;
    }

    try {
      await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidateInit));
    } catch {
      // Ignored
    }
  }

  /**
   * Flushes queued candidates once remote description is ready.
   */
  private async flushPendingCandidates(): Promise<void> {
    if (!this.peerConnection || !this.peerConnection.remoteDescription) return;

    while (this.pendingCandidates.length > 0) {
      const candidateInit = this.pendingCandidates.shift();
      if (candidateInit) {
        try {
          await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidateInit));
        } catch {
          // Ignored
        }
      }
    }
  }

  /**
   * Toggles microphone audio track.
   */
  public toggleMute(isMuted: boolean): void {
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        track.enabled = !isMuted;
      });
    }
  }

  /**
   * Toggles camera video track.
   */
  public toggleCamera(isCameraOff: boolean): void {
    if (this.localStream) {
      this.localStream.getVideoTracks().forEach((track) => {
        track.enabled = !isCameraOff;
      });
    }
  }

  /**
   * Replaces camera track with screen share stream.
   */
  public async startScreenShare(): Promise<MediaStream> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getDisplayMedia) {
      throw new Error('Screen sharing is not supported on this browser');
    }

    const screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: false,
    });

    const screenTrack = screenStream.getVideoTracks()[0];
    const senders = this.peerConnection?.getSenders() || [];
    const videoSender = senders.find((s) => s.track?.kind === 'video');

    if (!screenTrack || !this.peerConnection || !videoSender) {
      screenStream.getTracks().forEach((t) => t.stop());
      throw new Error('Screen sharing requires an active video call.');
    }

    this.screenStream = screenStream;
    this.activeVideoSender = videoSender;
    await videoSender.replaceTrack(screenTrack);

    screenTrack.onended = () => {
      this.stopScreenShare();
      if (this.onScreenShareEndedCb) {
        this.onScreenShareEndedCb();
      }
    };

    return screenStream;
  }

  /**
   * Reverts back to camera track when screen sharing stops.
   */
  public async stopScreenShare(): Promise<void> {
    if (this.screenStream) {
      this.screenStream.getTracks().forEach((t) => t.stop());
      this.screenStream = null;
    }

    if (this.localStream && this.peerConnection) {
      const cameraTrack = this.localStream.getVideoTracks()[0];
      const senders = this.peerConnection.getSenders();
      const videoSender =
        this.activeVideoSender ||
        senders.find((s) => s.track?.kind === 'video');

      if (videoSender && cameraTrack) {
        await videoSender.replaceTrack(cameraTrack);
      }
    }
    this.activeVideoSender = null;
  }

  /**
   * Full teardown of media tracks and connections.
   */
  public cleanup(): void {
    // 1. Stop local stream tracks (shuts off mic and camera hardware indicators)
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {}
      });
      this.localStream = null;
    }

    // 2. Stop screen share stream
    if (this.screenStream) {
      this.screenStream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {}
      });
      this.screenStream = null;
    }

    // 3. Stop remote stream tracks
    if (this.remoteStream) {
      this.remoteStream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {}
      });
      this.remoteStream = null;
    }

    // 4. Close PeerConnection
    if (this.peerConnection) {
      try {
        this.peerConnection.onicecandidate = null;
        this.peerConnection.ontrack = null;
        this.peerConnection.onconnectionstatechange = null;
        this.peerConnection.close();
      } catch {}
      this.peerConnection = null;
    }

    this.pendingCandidates = [];
    this.activeVideoSender = null;
    this.callId = null;
  }
}

export const webrtcManager = new WebRTCManager();
