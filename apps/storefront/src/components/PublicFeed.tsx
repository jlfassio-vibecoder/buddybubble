import StorefrontAuthProvider, { useStorefrontAuth } from './StorefrontAuthProvider';
import { usePublicFeedRealtime } from '../hooks/usePublicFeedRealtime';
import type { PublicFeedItem } from '../lib/public-feed-types';
import PublicFeedCard from './PublicFeedCard';

type FeedBodyProps = {
  workspaceId: string;
  initialFeed: PublicFeedItem[];
  bubbleIds: string[];
};

function PublicFeedBody({ workspaceId, initialFeed, bubbleIds }: FeedBodyProps) {
  const { supabase } = useStorefrontAuth();
  const items = usePublicFeedRealtime(supabase, workspaceId, bubbleIds, initialFeed);

  if (items.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-12 text-center text-sm text-zinc-600 shadow-sm">
        No public cards or classes yet. Check back soon.
      </p>
    );
  }

  return (
    <div className="columns-1 gap-6 sm:columns-2 lg:columns-3">
      {items.map((item) => (
        <PublicFeedCard
          key={item.kind === 'task' ? `task-${item.taskId}` : `class-${item.instance.id}`}
          item={item}
        />
      ))}
    </div>
  );
}

type Props = FeedBodyProps & {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
};

export default function PublicFeed({
  workspaceId,
  initialFeed,
  bubbleIds,
  supabaseUrl,
  supabaseAnonKey,
}: Props) {
  return (
    <StorefrontAuthProvider supabaseUrl={supabaseUrl} supabaseAnonKey={supabaseAnonKey}>
      <PublicFeedBody workspaceId={workspaceId} initialFeed={initialFeed} bubbleIds={bubbleIds} />
    </StorefrontAuthProvider>
  );
}
