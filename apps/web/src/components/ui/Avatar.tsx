import React from 'react';
import { PresenceStatus } from '@chatterbox/shared';
import { cn } from '../../lib/utils';

export interface AvatarProps {
  src?: string | null;
  name: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showOnlineDot?: boolean;
  presenceStatus?: PresenceStatus;
  className?: string;
}

export const Avatar: React.FC<AvatarProps> = ({
  src,
  name,
  size = 'md',
  showOnlineDot = false,
  presenceStatus,
  className,
}) => {
  const [imageError, setImageError] = React.useState(false);

  React.useEffect(() => {
    setImageError(false);
  }, [src]);

  const sizes = {
    sm: 'w-7 h-7 text-xs',
    md: 'w-9 h-9 text-sm',
    lg: 'w-12 h-12 text-base',
    xl: 'w-20 h-20 text-xl',
  };

  const dotSizes = {
    sm: 'w-2 h-2 bottom-0 right-0',
    md: 'w-2.5 h-2.5 bottom-0 right-0',
    lg: 'w-3 h-3 bottom-0.5 right-0.5',
    xl: 'w-4 h-4 bottom-1 right-1',
  };

  const initials = (name || '?')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || '?';

  const shouldShowDot = showOnlineDot || presenceStatus !== undefined;
  const dotColor =
    presenceStatus === 'ONLINE'
      ? 'bg-status-online'
      : presenceStatus === 'AWAY'
        ? 'bg-status-away'
        : presenceStatus === 'IN_CALL'
          ? 'bg-status-busy'
          : 'bg-status-offline';

  return (
    <div className={cn('relative inline-flex shrink-0 select-none', className)}>
      <div
        className={cn(
          'rounded-full overflow-hidden flex items-center justify-center font-semibold bg-accent-primary/20 text-accent-bright border border-border',
          sizes[size],
        )}
      >
        {src && !imageError ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={name}
            onError={() => setImageError(true)}
            className="w-full h-full object-cover"
          />
        ) : (
          <span>{initials}</span>
        )}
      </div>
      {shouldShowDot && (
        <span
          className={cn(
            'absolute rounded-full ring-2 ring-canvas',
            dotColor,
            dotSizes[size],
          )}
        />
      )}
    </div>
  );
};
