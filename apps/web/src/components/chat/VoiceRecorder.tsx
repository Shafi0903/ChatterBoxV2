'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Mic, Square, Trash2, Send, Loader2 } from 'lucide-react';
import { api, uploadMediaWithFallback } from '../../lib/api';
import { Button } from '../ui/Button';

interface VoiceRecorderProps {
  conversationId: string;
  onSendVoiceNote: (attachmentId: string, durationSec: number, stagedAttachment: any) => Promise<void>;
  onCancel: () => void;
}

export const VoiceRecorder: React.FC<VoiceRecorderProps> = ({
  conversationId,
  onSendVoiceNote,
  onCancel,
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [durationSec, setDurationSec] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Stop all active stream tracks
  const stopTracks = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  // Start recording on mount
  useEffect(() => {
    let mounted = true;

    async function initRecorder() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (!mounted) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;

        // Determine best supported MIME type
        let selectedMimeType = 'audio/webm';
        if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
          selectedMimeType = 'audio/webm;codecs=opus';
        } else if (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) {
          selectedMimeType = 'audio/ogg;codecs=opus';
        }

        const recorder = new MediaRecorder(stream, { mimeType: selectedMimeType });
        mediaRecorderRef.current = recorder;
        audioChunksRef.current = [];

        recorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) {
            audioChunksRef.current.push(event.data);
          }
        };

        recorder.start(100); // 100ms slices
        setIsRecording(true);

        timerRef.current = setInterval(() => {
          setDurationSec((prev) => prev + 1);
        }, 1000);
      } catch (err: any) {
        console.error('Microphone access denied or error:', err);
        setErrorMsg('Microphone access denied or not available.');
      }
    }

    initRecorder();

    return () => {
      mounted = false;
      if (timerRef.current) clearInterval(timerRef.current);
      stopTracks();
    };
  }, []);

  const handleCancel = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    stopTracks();
    onCancel();
  };

  const handleStopAndSend = async () => {
    if (!mediaRecorderRef.current || isUploading) return;
    setIsUploading(true);

    if (timerRef.current) clearInterval(timerRef.current);

    const recorder = mediaRecorderRef.current;

    recorder.onstop = async () => {
      try {
        stopTracks();

        // Adjustment #1: Normalize mimeType by stripping codec suffix
        const rawMime = recorder.mimeType || 'audio/webm';
        const normalizedMime = rawMime.split(';')[0].trim(); // e.g. "audio/webm"
        const ext = normalizedMime === 'audio/ogg' ? 'ogg' : 'webm';
        const filename = `voice-note-${Date.now()}.${ext}`;

        const audioBlob = new Blob(audioChunksRef.current, { type: normalizedMime });
        const sizeBytes = audioBlob.size;

        if (sizeBytes === 0) {
          setErrorMsg('Recorded audio is empty.');
          setIsUploading(false);
          return;
        }

        // 1. Presign
        const presignRes = await api.presignUpload({
          filename,
          mimeType: normalizedMime as any,
          sizeBytes,
          durationSec,
        });

        // 2. Upload directly to S3 with automatic authenticated API relay fallback
        await uploadMediaWithFallback({
          attachmentId: presignRes.attachmentId,
          uploadUrl: presignRes.uploadUrl,
          file: audioBlob,
          contentType: normalizedMime,
        });

        // 3. Confirm
        const confirmRes = await api.confirmUpload(presignRes.attachmentId);

        // 4. Send message
        await onSendVoiceNote(confirmRes.id, durationSec, {
          id: confirmRes.id,
          originalName: confirmRes.originalName,
          mimeType: confirmRes.mimeType,
          sizeBytes: confirmRes.sizeBytes,
          status: confirmRes.status,
          durationSec,
        });
      } catch (err: any) {
        console.error('Failed to upload/send voice note:', err);
        setErrorMsg(err.message || 'Failed to send voice note.');
        setIsUploading(false);
      }
    };

    recorder.stop();
  };

  const formatTimer = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  if (errorMsg) {
    return (
      <div className="flex items-center justify-between p-3 bg-status-busy/15 border border-status-busy/30 rounded-2xl text-xs text-status-busy">
        <span>{errorMsg}</span>
        <Button size="sm" variant="ghost" onClick={handleCancel}>
          Close
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 p-2 bg-elevated/80 border border-accent/40 rounded-2xl animate-in fade-in duration-200">
      {/* Live recording indicator */}
      <div className="flex items-center gap-2 px-2">
        <span className="relative flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-status-busy opacity-75"></span>
          <span className="relative inline-flex rounded-full h-3 w-3 bg-status-busy"></span>
        </span>
        <span className="text-xs font-mono font-semibold text-primary">
          {formatTimer(durationSec)}
        </span>
        <span className="text-[11px] text-muted hidden sm:inline">Recording audio note...</span>
      </div>

      {/* Action controls */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleCancel}
          disabled={isUploading}
          className="p-2 rounded-xl text-muted hover:text-status-busy hover:bg-status-busy/10 transition-colors"
          title="Cancel recording"
        >
          <Trash2 className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={handleStopAndSend}
          disabled={isUploading || durationSec < 1}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-accent text-white font-medium text-xs hover:bg-accent/90 disabled:opacity-50 transition-all shadow-sm"
        >
          {isUploading ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Sending...</span>
            </>
          ) : (
            <>
              <Send className="w-3.5 h-3.5" />
              <span>Send</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
