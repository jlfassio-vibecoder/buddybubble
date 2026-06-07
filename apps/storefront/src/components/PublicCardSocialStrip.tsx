'use client';

import { useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { useTaskBubbleUps } from '@/hooks/use-task-bubble-ups';
import { BubblyButton } from '@/components/tasks/bubbly-button';
import PublicTaskCommentsSheet from './PublicTaskCommentsSheet';
import { useStorefrontAuth } from './StorefrontAuthProvider';

type Props = {
  taskId: string;
  bubbleId: string;
  title: string;
  commentCount?: number;
};

export default function PublicCardSocialStrip({
  taskId,
  bubbleId,
  title,
  commentCount = 0,
}: Props) {
  const { userId, ready } = useStorefrontAuth();
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [count, setCount] = useState(commentCount);
  const { bubbleUpPropsFor } = useTaskBubbleUps([taskId]);
  const bubbly = bubbleUpPropsFor(taskId);

  return (
    <>
      <div
        className="mt-4 flex flex-wrap items-center gap-2 border-t border-zinc-200/80 pt-3"
        style={{ ['--sidebar-active' as string]: '#2563eb' }}
      >
        {ready && userId && bubbly ? (
          <BubblyButton {...bubbly} density="micro" tabStrip />
        ) : (
          <span className="rounded-md px-1.5 py-0.5 text-[9px] font-semibold text-zinc-400">
            Bubbly
          </span>
        )}
        <button
          type="button"
          onClick={() => setCommentsOpen(true)}
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[9px] font-semibold text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
        >
          <MessageCircle className="size-3 shrink-0" aria-hidden />
          Comments{count > 0 ? ` · ${count}` : ''}
        </button>
      </div>

      {commentsOpen ? (
        <PublicTaskCommentsSheet
          taskId={taskId}
          bubbleId={bubbleId}
          title={title}
          onClose={() => setCommentsOpen(false)}
          onCountChange={setCount}
        />
      ) : null}
    </>
  );
}
