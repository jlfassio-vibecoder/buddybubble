'use client';

import { toast } from 'sonner';

type RequestImageLinkProps = {
  exerciseName: string;
  exerciseQuery?: string;
  taskId: string | null;
};

export function RequestImageLink({ exerciseName, exerciseQuery, taskId }: RequestImageLinkProps) {
  const body = [
    'Please add or generate a visualization image for this exercise in the BuddyBubble library.',
    '',
    `Exercise: ${exerciseName}`,
    exerciseQuery?.trim() ? `Catalog / query hint: ${exerciseQuery.trim()}` : null,
    taskId ? `Task ID: ${taskId}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const subject = encodeURIComponent('Exercise image request');
  const bodyEnc = encodeURIComponent(body);
  const to =
    typeof process !== 'undefined' && process.env.NEXT_PUBLIC_EXERCISE_IMAGE_REQUEST_EMAIL?.trim()
      ? process.env.NEXT_PUBLIC_EXERCISE_IMAGE_REQUEST_EMAIL.trim()
      : '';
  const href = to
    ? `mailto:${to}?subject=${subject}&body=${bodyEnc}`
    : `mailto:?subject=${subject}&body=${bodyEnc}`;

  return (
    <a
      href={href}
      className="mt-1.5 inline-block text-[11px] font-medium text-primary/90 underline-offset-2 hover:underline"
      onClick={() => {
        toast.message('Opening your mail app…', {
          description: 'Add our team address in To: if your client left it blank.',
        });
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      Request image
    </a>
  );
}
