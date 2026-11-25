'use client';

import React, { useState } from 'react';
import { api, uploadMediaWithFallback } from '../../lib/api';
import { useSocialStore } from '../../stores/social.store';
import { Button } from '../ui/Button';
import { X, Image as ImageIcon, Type, Loader2 } from 'lucide-react';

interface CreateStoryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const GRADIENT_SWATCHES = [
  'from-purple-900 via-indigo-950 to-black',
  'from-cyan-900 via-blue-950 to-black',
  'from-emerald-900 via-teal-950 to-black',
  'from-rose-900 via-pink-950 to-black',
  'from-amber-900 via-orange-950 to-black',
  'from-fuchsia-900 via-purple-950 to-black',
];

export const CreateStoryModal: React.FC<CreateStoryModalProps> = ({ isOpen, onClose }) => {
  const createStory = useSocialStore((s) => s.createStory);

  const [activeTab, setActiveTab] = useState<'media' | 'text'>('media');

  // Media story state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [mediaCaption, setMediaCaption] = useState('');

  // Text story state
  const [textContent, setTextContent] = useState('');
  const [selectedGradient, setSelectedGradient] = useState(GRADIENT_SWATCHES[0]);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Adjustment #2: Restrict strictly to images and videos
    const allowed = [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
      'video/mp4',
      'video/webm',
    ];
    if (!allowed.includes(file.type)) {
      setError('Only JPEG, PNG, WebP, GIF images and MP4, WebM videos are supported');
      return;
    }

    if (previewUrl) URL.revokeObjectURL(previewUrl);

    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setError(null);
  };

  const handleClose = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(null);
    setPreviewUrl(null);
    setMediaCaption('');
    setTextContent('');
    setError(null);
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    setIsLoading(true);
    try {
      if (activeTab === 'media') {
        if (!selectedFile) {
          setError('Please select an image or video file');
          setIsLoading(false);
          return;
        }

        // 1. Presign upload
        const presign = await api.presignUpload({
          filename: selectedFile.name,
          mimeType: selectedFile.type as any,
          sizeBytes: selectedFile.size,
        });

        // 2. Upload directly to S3 with automatic authenticated API relay fallback
        await uploadMediaWithFallback({
          attachmentId: presign.attachmentId,
          uploadUrl: presign.uploadUrl,
          file: selectedFile,
          contentType: selectedFile.type,
        });

        // 3. Confirm upload
        const attachment = await api.confirmUpload(presign.attachmentId);

        // 4. Create story
        await createStory({
          attachmentId: attachment.id,
          caption: mediaCaption.trim() || undefined,
        });
      } else {
        if (!textContent.trim()) {
          setError('Please enter some text for your story');
          setIsLoading(false);
          return;
        }

        await createStory({
          caption: textContent.trim(),
          backgroundColor: selectedGradient,
        });
      }

      handleClose();
    } catch (err: any) {
      setError(err.message || 'Failed to create story');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="w-full max-w-md bg-surface border border-border rounded-2xl p-6 shadow-2xl relative">
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 text-secondary hover:text-primary p-1 rounded-lg hover:bg-elevated transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <h2 className="text-lg font-bold text-primary mb-1">Create a Story</h2>
        <p className="text-xs text-secondary mb-4">
          Share a photo, video, or thought that automatically disappears in 24 hours.
        </p>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-status-busy/15 border border-status-busy/30 text-status-busy text-xs">
            {error}
          </div>
        )}

        {/* Tab Toggle */}
        <div className="flex border-b border-border pb-3 mb-4 gap-4">
          <button
            type="button"
            onClick={() => setActiveTab('media')}
            className={`text-xs font-semibold pb-1.5 border-b-2 flex items-center gap-1.5 transition-colors ${
              activeTab === 'media'
                ? 'border-accent text-accent-bright'
                : 'border-transparent text-secondary hover:text-primary'
            }`}
          >
            <ImageIcon className="w-3.5 h-3.5" />
            Media Story
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('text')}
            className={`text-xs font-semibold pb-1.5 border-b-2 flex items-center gap-1.5 transition-colors ${
              activeTab === 'text'
                ? 'border-accent text-accent-bright'
                : 'border-transparent text-secondary hover:text-primary'
            }`}
          >
            <Type className="w-3.5 h-3.5" />
            Text Story
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {activeTab === 'media' ? (
            <>
              {/* File Drop / Preview */}
              <div className="relative border-2 border-dashed border-border rounded-2xl overflow-hidden min-h-[200px] flex flex-col items-center justify-center bg-elevated/30">
                {previewUrl ? (
                  <div className="relative w-full h-52 flex items-center justify-center bg-black/60">
                    {selectedFile?.type.startsWith('video/') ? (
                      <video src={previewUrl} className="max-h-full max-w-full object-contain" controls />
                    ) : (
                      <img src={previewUrl} alt="Preview" className="max-h-full max-w-full object-contain" />
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        URL.revokeObjectURL(previewUrl);
                        setSelectedFile(null);
                        setPreviewUrl(null);
                      }}
                      className="absolute top-2 right-2 p-1.5 rounded-full bg-black/70 text-white hover:bg-black transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <label className="cursor-pointer flex flex-col items-center justify-center p-6 text-center w-full h-full">
                    <ImageIcon className="w-8 h-8 text-secondary mb-2" />
                    <span className="text-xs font-medium text-primary">Upload photo or video</span>
                    <span className="text-[10px] text-secondary mt-1">JPEG, PNG, WebP, GIF, MP4, WebM</span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                  </label>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-secondary uppercase tracking-wider mb-1.5">
                  Caption (Optional)
                </label>
                <input
                  type="text"
                  value={mediaCaption}
                  onChange={(e) => setMediaCaption(e.target.value)}
                  maxLength={300}
                  placeholder="Add a caption to your story..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-elevated border border-border text-primary text-xs focus:outline-hidden focus:border-accent"
                />
              </div>
            </>
          ) : (
            <>
              {/* Text Canvas Preview */}
              <div
                className={`w-full h-52 rounded-2xl p-6 flex items-center justify-center text-center bg-gradient-to-br ${selectedGradient} border border-border shadow-inner relative overflow-hidden`}
              >
                <textarea
                  value={textContent}
                  onChange={(e) => setTextContent(e.target.value)}
                  maxLength={300}
                  placeholder="Type your story here..."
                  className="w-full h-full bg-transparent text-white font-bold text-base text-center placeholder:text-white/40 resize-none focus:outline-hidden flex items-center justify-center py-6"
                />
              </div>

              {/* Gradient Swatches */}
              <div>
                <label className="block text-xs font-semibold text-secondary uppercase tracking-wider mb-2">
                  Canvas Style
                </label>
                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                  {GRADIENT_SWATCHES.map((swatch, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setSelectedGradient(swatch)}
                      className={`w-8 h-8 rounded-full bg-gradient-to-br ${swatch} shrink-0 transition-transform ${
                        selectedGradient === swatch ? 'scale-110 ring-2 ring-accent ring-offset-2 ring-offset-surface' : 'opacity-80 hover:opacity-100'
                      }`}
                    />
                  ))}
                </div>
              </div>
            </>
          )}

          <div className="flex justify-end gap-2.5 pt-3 border-t border-border mt-4">
            <Button type="button" variant="secondary" size="md" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="md" isLoading={isLoading}>
              Share to Story
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
