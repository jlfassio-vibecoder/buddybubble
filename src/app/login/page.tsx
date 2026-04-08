import { Fraunces } from 'next/font/google';
import { Suspense } from 'react';
import { LoginForm } from './login-form';

const loginDisplay = Fraunces({
  subsets: ['latin'],
  display: 'swap',
});

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-amber-50 text-amber-800">
          Loading…
        </div>
      }
    >
      <LoginForm titleFontClassName={loginDisplay.className} />
    </Suspense>
  );
}
