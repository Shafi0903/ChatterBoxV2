import React from 'react';
import { cn } from '../../lib/utils';

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, hint, id, ...props }, ref) => {
    const inputId = id || props.name;

    return (
      <div className="w-full flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="text-xs font-medium text-secondary uppercase tracking-wider"
          >
            {label}
          </label>
        )}
        <input
          id={inputId}
          ref={ref}
          className={cn(
            'w-full px-3.5 py-2.5 bg-elevated border border-border rounded-xl text-primary text-sm',
            'placeholder:text-muted focus:outline-none focus:border-accent-bright focus:ring-1 focus:ring-accent-bright',
            'transition-colors duration-150',
            error && 'border-status-busy focus:border-status-busy focus:ring-status-busy',
            className,
          )}
          {...props}
        />
        {error && <span className="text-xs text-status-busy font-medium">{error}</span>}
        {hint && !error && <span className="text-xs text-muted">{hint}</span>}
      </div>
    );
  },
);

Input.displayName = 'Input';
