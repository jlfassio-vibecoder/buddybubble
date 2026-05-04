import { Fraunces } from 'next/font/google';
import { redirect } from 'next/navigation';
import { createClient } from '@utils/supabase/server';
import { cn } from '@/lib/utils';
import { UpdatePasswordForm } from './update-password-form';

const titleDisplay = Fraunces({
  subsets: ['latin'],
  display: 'swap',
});

export default async function UpdatePasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect('/login?next=/update-password');
  }

  return (
    <main className="min-h-screen bg-amber-50 text-amber-950 antialiased">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col justify-center px-4 py-12 sm:px-6 lg:py-16">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <div className="text-left">
            <p className="inline-flex items-center rounded-full border border-amber-200 bg-amber-100 px-3.5 py-1 text-xs font-semibold uppercase tracking-wide text-amber-800">
              Community Engagement Forum
            </p>
            <h1
              className={cn(
                titleDisplay.className,
                'mt-6 max-w-xl text-balance text-4xl font-medium tracking-tight text-amber-950 sm:text-5xl lg:text-6xl',
              )}
            >
              Set your password
            </h1>
            <p className="mt-6 max-w-lg text-pretty text-lg leading-relaxed text-amber-900 sm:text-xl">
              You opened a secure link from your email. Choose a strong password, then continue to
              your workspaces.
            </p>
          </div>

          <div className="w-full lg:justify-self-end">
            <div className="mx-auto w-full max-w-md rounded-2xl border border-amber-200/90 bg-white p-8 shadow-xl shadow-amber-950/[0.06] lg:mx-0 lg:max-w-none">
              <div className="mb-6 border-b border-amber-100 pb-6">
                <h2 className="text-lg font-semibold text-amber-950">Update password</h2>
                <p className="mt-1 text-sm text-amber-800/90">
                  Use at least 8 characters for your new password.
                </p>
              </div>
              <UpdatePasswordForm email={user.email ?? ''} />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
