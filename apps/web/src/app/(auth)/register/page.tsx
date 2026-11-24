'use client';

import React, { useState } from 'react';
import NextLink from 'next/link';
import { useRouter } from 'next/navigation';
import { registerSchema } from '@chatterbox/shared';
import { useAuthStore } from '../../../stores/auth.store';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { ApiError } from '../../../lib/api';

export default function RegisterPage() {
  const router = useRouter();
  const register = useAuthStore((s) => s.register);

  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);
    setFieldErrors({});

    // Client-side Zod validation
    const result = registerSchema.safeParse({
      email,
      username,
      displayName,
      password,
    });

    if (!result.success) {
      const errors: Record<string, string> = {};
      result.error.errors.forEach((err) => {
        const field = err.path[0] as string;
        if (field && !errors[field]) {
          errors[field] = err.message;
        }
      });
      setFieldErrors(errors);
      return;
    }

    setIsLoading(true);
    try {
      await register(result.data);
      router.replace('/home');
    } catch (err) {
      if (err instanceof ApiError) {
        setServerError(err.message);
      } else {
        setServerError('Registration failed. Please check your details.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full bg-surface/90 border border-border backdrop-blur-md rounded-2xl p-8 shadow-2xl">
      {/* Brand Header */}
      <div className="flex flex-col items-center text-center mb-6">
        <div className="w-12 h-12 rounded-2xl bg-accent flex items-center justify-center shadow-neon mb-3">
          <svg
            className="w-7 h-7 text-white"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
          </svg>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-primary">Join ChatterBox</h1>
        <p className="text-xs text-secondary mt-1 font-medium tracking-wide">
          Connect · Chat · Share · Belong
        </p>
      </div>

      {serverError && (
        <div className="mb-5 p-3 rounded-xl bg-status-busy/15 border border-status-busy/30 text-status-busy text-xs font-medium flex items-center gap-2">
          <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          <span>{serverError}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
        <Input
          label="Email Address"
          type="email"
          placeholder="you@domain.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={fieldErrors.email}
          autoComplete="email"
          autoFocus
        />

        <Input
          label="Username"
          type="text"
          placeholder="e.g. alice_wonder"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          error={fieldErrors.username}
          hint="Only letters, numbers, and underscores"
          autoComplete="username"
        />

        <Input
          label="Display Name"
          type="text"
          placeholder="e.g. Alice"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          error={fieldErrors.displayName}
          autoComplete="name"
        />

        <Input
          label="Password"
          type="password"
          placeholder="Minimum 8 characters"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={fieldErrors.password}
          autoComplete="new-password"
        />

        <Button
          type="submit"
          variant="primary"
          size="lg"
          isLoading={isLoading}
          className="w-full mt-2"
        >
          Create Account
        </Button>
      </form>

      <div className="mt-6 pt-5 border-t border-border text-center">
        <p className="text-xs text-secondary">
          Already have an account?{' '}
          <NextLink
            href="/login"
            className="text-accent-bright font-semibold hover:underline"
          >
            Sign in
          </NextLink>
        </p>
      </div>
    </div>
  );
}
