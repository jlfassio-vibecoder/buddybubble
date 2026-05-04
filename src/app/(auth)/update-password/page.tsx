import { redirect } from 'next/navigation';
import { createClient } from '@utils/supabase/server';
import { UpdatePasswordForm } from './update-password-form';

export default async function UpdatePasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect('/login?next=/update-password');
  }

  return (
    <main className="min-h-screen bg-amber-50 px-4 py-16 text-amber-950 antialiased">
      <div className="mx-auto max-w-lg rounded-2xl border border-amber-200/90 bg-white p-8 shadow-xl shadow-amber-950/[0.06]">
        <h1 className="text-xl font-semibold text-amber-950">Set your password</h1>
        <p className="mt-2 text-sm text-amber-800/90">
          You opened a secure link from your email. Set a password before continuing to the app.
        </p>
        <div className="mt-8">
          <UpdatePasswordForm email={user.email ?? ''} />
        </div>
      </div>
    </main>
  );
}
