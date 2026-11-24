import React, { useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { MessageItem } from '@chatterbox/shared';

interface EditMessageModalProps {
  message: MessageItem | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (messageId: string, content: string) => Promise<void>;
}

export const EditMessageModal: React.FC<EditMessageModalProps> = ({
  message,
  isOpen,
  onClose,
  onSave,
}) => {
  const [content, setContent] = useState(message?.content || '');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    if (message) {
      setContent(message.content);
      setError(null);
    }
  }, [message]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message || !content.trim()) return;

    setIsSaving(true);
    setError(null);
    try {
      await onSave(message.id, content.trim());
      onClose();
    } catch {
      setError('Failed to edit message. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Edit Message"
      description="Update your sent message text."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-2.5 rounded-xl bg-status-busy/10 border border-status-busy/30 text-xs text-status-busy">
            {error}
          </div>
        )}

        <div>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={4}
            className="w-full p-3 rounded-xl bg-elevated border border-border text-xs text-primary focus:outline-none focus:border-accent-bright transition-colors resize-none"
            placeholder="Edit your message..."
            autoFocus
            required
          />
        </div>

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onClose}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            disabled={isSaving || !content.trim() || content.trim() === message?.content}
          >
            {isSaving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
