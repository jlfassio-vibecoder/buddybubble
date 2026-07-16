'use client';

import type { PublicVideoCardData } from '../lib/public-video-types';

type Props = {
  video: PublicVideoCardData;
  onWatch: (publicationId: string) => void;
};

function formatPublishedAt(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export default function PublicVideoCard({ video, onWatch }: Props) {
  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="min-w-0">
        <h3 className="truncate text-base font-semibold text-zinc-900">{video.title}</h3>
        <p className="mt-1 text-xs text-zinc-500">{formatPublishedAt(video.publishedAt)}</p>
      </div>
      <button
        type="button"
        className="mt-auto inline-flex h-9 items-center justify-center rounded-xl bg-zinc-900 px-3 text-sm font-semibold text-white transition hover:bg-zinc-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
        onClick={() => onWatch(video.publicationId)}
      >
        Watch
      </button>
    </article>
  );
}
