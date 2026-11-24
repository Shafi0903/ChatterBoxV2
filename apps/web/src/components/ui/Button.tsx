import React from 'react';
import { cn } from '../../lib/utils';

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      children,
      variant = 'primary',
      size = 'md',
      isLoading = false,
      disabled,
      ...props
    },
    ref,
  ) => {
    const baseStyles =
      'inline-flex items-center justify-center font-medium transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-accent-bright/50 disabled:opacity-50 disabled:cursor-not-allowed select-none active:scale-[0.98]';

    const variants = {
      primary:
        'bg-accent hover:bg-accent-bright text-white shadow-neon hover:shadow-neon-strong',
      secondary:
        'bg-elevated hover:bg-surface-hover text-primary border border-border',
      outline:
        'border border-border hover:border-accent-bright/50 bg-transparent text-primary hover:bg-surface-hover',
      ghost:
        'bg-transparent hover:bg-surface-hover text-secondary hover:text-primary',
      danger:
        'bg-status-busy hover:bg-red-600 text-white shadow-sm',
    };

    const sizes = {
      sm: 'text-xs px-3 py-1.5 rounded-xl h-8',
      md: 'text-sm px-4 py-2 rounded-xl h-10',
      lg: 'text-base px-6 py-2.5 rounded-xl h-12',
    };

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        {...props}
      >
        {isLoading && (
          <svg
            className="animate-spin -ml-1 mr-2 h-4 w-4 text-current"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            ></circle>
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8v8H4z"
            ></path>
          </svg>
        )}
        {children}
      </button>
    );
  },
);

Button.displayName = 'Button';
