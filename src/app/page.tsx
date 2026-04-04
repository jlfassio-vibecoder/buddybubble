import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-2xl font-semibold text-foreground">BuddyBubble</h1>
      <p className="text-muted-foreground">Chat and tasks in your BuddyBubbles and Bubbles.</p>
      <div className="flex gap-3">
        <Link
          href="/login"
          className="inline-flex h-8 items-center justify-center rounded-lg bg-primary px-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/80"
        >
          Sign in
        </Link>
        <Link
          href="/app"
          className="inline-flex h-8 items-center justify-center rounded-lg border border-border bg-background px-2.5 text-sm font-medium hover:bg-muted"
        >
          Open app
        </Link>
      </div>
    </main>
  );
}
