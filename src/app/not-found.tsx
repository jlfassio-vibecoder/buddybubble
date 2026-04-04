import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-xl font-semibold">Page not found</h1>
      <Link href="/" className="text-sm text-primary underline">
        Home
      </Link>
    </main>
  );
}
