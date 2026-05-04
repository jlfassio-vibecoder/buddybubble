'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { updatePasswordAction } from './actions';

const inputClass =
  'w-full rounded-xl border border-amber-200 bg-white px-3 py-2.5 text-sm text-amber-950 outline-none transition placeholder:text-amber-400/80 focus:border-amber-400 focus:ring-2 focus:ring-amber-400/25';

const primaryBtnClass =
  'h-11 w-full rounded-xl border-0 bg-amber-500 text-base font-semibold text-white shadow-lg shadow-amber-200/80 hover:bg-amber-600 focus-visible:ring-amber-500/40';

type Props = {
  email: string;
};

export function UpdatePasswordForm({ email }: Props) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    const result = await updatePasswordAction(password);
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast.success('Password updated successfully!');
    router.push('/app');
    router.refresh();
  }

  return (
    <>
      <form onSubmit={(e) => void onSubmit(e)} className="w-full space-y-4">
        <p className="text-sm text-amber-800">
          {email ? (
            <>
              Signed in as <span className="font-medium text-amber-950">{email}</span>. Choose a
              password to finish securing your account.
            </>
          ) : (
            <>Choose a password to finish securing your account.</>
          )}
        </p>
        {error ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        ) : null}
        <div>
          <label htmlFor="new-password" className="mb-1.5 block text-sm font-medium text-amber-900">
            New password
          </label>
          <input
            id="new-password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            className={inputClass}
          />
        </div>
        <div>
          <label
            htmlFor="confirm-password"
            className="mb-1.5 block text-sm font-medium text-amber-900"
          >
            Confirm password
          </label>
          <input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={8}
            className={inputClass}
          />
        </div>
        <Button type="submit" className={primaryBtnClass} disabled={loading}>
          {loading ? 'Saving…' : 'Save password and continue'}
        </Button>
      </form>
      <p className="mt-8 text-center text-sm text-amber-800/90">
        <Link
          href="/"
          className="font-medium text-amber-900 underline decoration-amber-300 underline-offset-4 transition hover:text-amber-950 hover:decoration-amber-500"
        >
          Back to home
        </Link>
      </p>
    </>
  );
}
