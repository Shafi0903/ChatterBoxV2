/**
 * Synthesizes a subtle, pleasant incoming ringtone using Web Audio API oscillators.
 * Safely guards against SSR, browser autoplay policies, and handles all teardown cleanly.
 */

let audioCtx: AudioContext | null = null;
let ringInterval: NodeJS.Timeout | null = null;
let isRinging = false;

function playRingToneBurst() {
  if (!audioCtx || audioCtx.state === 'closed') return;

  try {
    const now = audioCtx.currentTime;

    // Dual-tone frequencies: 440 Hz + 480 Hz (standard pleasant PBX ring)
    const osc1 = audioCtx.createOscillator();
    const osc2 = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(440, now);

    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(480, now);

    // Subtle gentle attack and release
    gainNode.gain.setValueAtTime(0.001, now);
    gainNode.gain.exponentialRampToValueAtTime(0.08, now + 0.05);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);

    osc1.connect(gainNode);
    osc2.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 1.25);
    osc2.stop(now + 1.25);
  } catch {
    // Autoplay or node creation failure tolerated silently
  }
}

export function startRingtone() {
  if (typeof window === 'undefined') return;
  if (isRinging) return;

  try {
    const AudioContextClass =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;

    if (!audioCtx || audioCtx.state === 'closed') {
      audioCtx = new AudioContextClass();
    }

    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }

    isRinging = true;
    playRingToneBurst();

    ringInterval = setInterval(() => {
      if (!isRinging) return;
      playRingToneBurst();
    }, 3000);
  } catch {
    // Ignored if browser blocks audio
  }
}

export function stopRingtone() {
  isRinging = false;
  if (ringInterval) {
    clearInterval(ringInterval);
    ringInterval = null;
  }
  if (audioCtx && audioCtx.state !== 'closed') {
    try {
      audioCtx.close().catch(() => {});
    } catch {
      // Ignored
    }
    audioCtx = null;
  }
}
