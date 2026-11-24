'use client';

import React, { useEffect } from 'react';
import { X, Download, ZoomIn, ZoomOut } from 'lucide-react';

interface MediaLightboxProps {
  src: string;
  alt: string;
  filename?: string;
  onClose: () => void;
}

export const MediaLightbox: React.FC<MediaLightboxProps> = ({
  src,
  alt,
  filename = 'image.png',
  onClose,
}) => {
  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    const anchor = document.createElement('a');
    anchor.href = src;
    anchor.download = filename;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-150 select-none"
    >
      {/* Top action bar */}
      <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
        <button
          type="button"
          onClick={handleDownload}
          className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white backdrop-blur-xs transition-colors"
          title="Download image"
        >
          <Download className="w-5 h-5" />
        </button>
        <button
          type="button"
          onClick={onClose}
          className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white backdrop-blur-xs transition-colors"
          title="Close (Esc)"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Image container */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-w-5xl max-h-[85vh] relative flex items-center justify-center"
      >
        <img
          src={src}
          alt={alt}
          className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl"
        />
      </div>

      {/* Bottom filename badge */}
      {filename && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-lg bg-white/10 backdrop-blur-xs text-xs text-white/90 font-medium">
          {filename}
        </div>
      )}
    </div>
  );
};
