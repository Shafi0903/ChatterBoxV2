import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  X,
  Copy,
  Check,
  AlertTriangle,
  Lock,
} from 'lucide-react';
import { api } from '../../lib/api';

interface SafetyNumberModalProps {
  isOpen: boolean;
  onClose: () => void;
  peerUserId: string;
  peerDisplayName: string;
}

export const SafetyNumberModal: React.FC<SafetyNumberModalProps> = ({
  isOpen,
  onClose,
  peerUserId,
  peerDisplayName,
}) => {
  const [safetyNumber, setSafetyNumber] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen && peerUserId) {
      setIsLoading(true);
      setError(null);
      api
        .getSafetyNumber(peerUserId)
        .then((res) => {
          setSafetyNumber(res.safetyNumber);
        })
        .catch((err: any) => {
          setError(
            err.message || 'Unable to compute safety number. Ensure both users have registered active devices.'
          );
        })
        .finally(() => {
          setIsLoading(false);
        });
    }
  }, [isOpen, peerUserId]);

  if (!isOpen) return null;

  const handleCopy = () => {
    if (safetyNumber) {
      navigator.clipboard.writeText(safetyNumber);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-md rounded-3xl bg-surface border border-border p-6 shadow-2xl space-y-5 select-none">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-primary">Verify Safety Number</h3>
              <p className="text-xs text-secondary">{peerDisplayName}</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-secondary hover:text-primary hover:bg-surface-hover transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Advisory */}
        <div className="p-3.5 rounded-2xl bg-elevated/60 border border-border/80 flex items-start gap-2.5">
          <Lock className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <p className="text-xs text-muted leading-relaxed">
            Messages in this conversation are end-to-end encrypted. To ensure no one has intercepted your keys, compare this safety number with {peerDisplayName} via an external channel (e.g. video call or in person).
          </p>
        </div>

        {/* Safety Number Display */}
        <div className="p-5 rounded-2xl bg-canvas border border-border/70 flex flex-col items-center justify-center space-y-3">
          {isLoading ? (
            <div className="py-4 text-xs text-muted animate-pulse">
              Computing verified cryptographic fingerprint...
            </div>
          ) : error ? (
            <div className="text-center space-y-1.5 py-2">
              <AlertTriangle className="w-5 h-5 text-amber-400 mx-auto" />
              <p className="text-xs text-amber-300 max-w-xs">{error}</p>
            </div>
          ) : (
            <>
              <span className="text-xs text-secondary font-medium tracking-wide">
                15-Digit Verification Fingerprint
              </span>
              <div className="text-xl sm:text-2xl font-mono font-bold tracking-widest text-emerald-400 select-all">
                {safetyNumber}
              </div>
              <button
                type="button"
                onClick={handleCopy}
                className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface hover:bg-surface-hover border border-border text-xs font-semibold text-primary transition-all duration-150"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Safety Number</span>
                  </>
                )}
              </button>
            </>
          )}
        </div>

        {/* Close Button */}
        <div className="pt-2">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 rounded-xl bg-elevated hover:bg-surface-hover border border-border text-xs font-semibold text-primary transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
