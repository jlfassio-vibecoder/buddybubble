'use client';

import { useActionState } from 'react';
import { createWorkspace, type CreateWorkspaceState } from './actions';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatUserFacingError } from '@/lib/format-error';

export default function NoWorkspaces() {
  const [state, formAction, pending] = useActionState(
    createWorkspace,
    null as CreateWorkspaceState,
  );

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-8">
      <div className="w-full max-w-md space-y-4 rounded-xl border border-border bg-card p-8 shadow-sm">
        <h1 className="text-lg font-semibold">Create your first BuddyBubble</h1>
        <p className="text-sm text-muted-foreground">
          You are not in any BuddyBubble yet. Create one to get started.
        </p>
        {state?.error && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {formatUserFacingError(state.error)}
          </p>
        )}
        <form action={formAction} className="space-y-4">
          <div>
            <label htmlFor="name" className="mb-1 block text-sm font-medium">
              BuddyBubble name
            </label>
            <input
              id="name"
              name="name"
              required
              placeholder="My team"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="category_type" className="mb-1 block text-sm font-medium">
              Category
            </label>
            <select
              id="category_type"
              name="category_type"
              defaultValue="business"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="business">Business</option>
              <option value="kids">Kids</option>
              <option value="class">Class</option>
              <option value="community">Community</option>
            </select>
          </div>
          <button
            type="submit"
            className={cn(buttonVariants({ variant: 'default' }), 'w-full')}
            disabled={pending}
          >
            {pending ? 'Creating…' : 'Create BuddyBubble'}
          </button>
        </form>
      </div>
    </main>
  );
}
