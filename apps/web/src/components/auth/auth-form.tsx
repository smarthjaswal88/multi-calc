'use client';

/**
 * Sign in and sign up, one component.
 *
 * Errors state what happened and how to fix it, and never apologise. A failed sign-in says
 * "Email or password is incorrect" without revealing which — the server returns one message for
 * both cases, and the interface does not undo that.
 */

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Sigma } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { ApiError, api } from '@/lib/api';
import { keys } from '@/lib/hooks';

interface AuthFormProps {
  mode: 'login' | 'signup';
}

export function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');

  const isSignup = mode === 'signup';

  const mutation = useMutation({
    mutationFn: () =>
      isSignup ? api.auth.signup(email, password) : api.auth.login(email, password),
    onSuccess: ({ user }) => {
      queryClient.setQueryData(keys.me, user);
      router.push('/documents');
    },
  });

  const error = mutation.error instanceof ApiError ? mutation.error : null;
  const emailError = error?.fieldMessage('email');
  const passwordError = error?.fieldMessage('password');
  // A failure with no field path is a form-level problem: wrong credentials, or an address
  // already registered.
  const formError = error && !emailError && !passwordError ? error.message : null;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-6 py-12">
      <div className="mb-8 flex items-center gap-2">
        <Sigma className="size-5 text-primary" />
        <span className="text-base font-semibold tracking-tight">Pricing Calculator</span>
      </div>

      <h1 className="text-2xl font-semibold">{isSignup ? 'Create an account' : 'Sign in'}</h1>
      <p className="mt-1 text-[0.8125rem] text-muted-foreground">
        {isSignup
          ? 'Build pricing documents with per-item discounts and tax.'
          : 'Pick up where you left off.'}
      </p>

      <form
        className="mt-8 space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate();
        }}
      >
        {formError && (
          <Alert variant="destructive">
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        )}

        <Field>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            autoFocus
            required
            value={email}
            aria-invalid={Boolean(emailError) || undefined}
            onChange={(event) => setEmail(event.target.value)}
          />
          <FieldError>{emailError}</FieldError>
        </Field>

        <Field>
          <FieldLabel htmlFor="password">Password</FieldLabel>
          <Input
            id="password"
            type="password"
            autoComplete={isSignup ? 'new-password' : 'current-password'}
            required
            value={password}
            aria-invalid={Boolean(passwordError) || undefined}
            onChange={(event) => setPassword(event.target.value)}
          />
          <FieldError>{passwordError}</FieldError>
          {isSignup && !passwordError && (
            <p className="text-[0.8125rem] text-muted-foreground">At least 8 characters.</p>
          )}
        </Field>

        <Button type="submit" className="w-full" disabled={mutation.isPending}>
          {mutation.isPending
            ? isSignup
              ? 'Creating account…'
              : 'Signing in…'
            : isSignup
              ? 'Create account'
              : 'Sign in'}
        </Button>
      </form>

      <p className="mt-6 text-[0.8125rem] text-muted-foreground">
        {isSignup ? 'Already have an account? ' : "Don't have an account? "}
        <Link
          href={isSignup ? '/login' : '/signup'}
          className="text-primary underline-offset-4 hover:underline"
        >
          {isSignup ? 'Sign in' : 'Create one'}
        </Link>
      </p>
    </div>
  );
}
