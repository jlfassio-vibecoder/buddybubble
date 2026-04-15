'use client';

import { X } from 'lucide-react';
import { useTaskCardCoverUrl } from '@/lib/task-card-cover';
import { cn } from '@/lib/utils';

export type TaskModalHeroProps = {
  title: string;
  description: string;
  /** Supabase Storage path in `task-attachments`, or empty when no cover. */
  coverPath: string | null;
  className?: string;
  /** Pinned top-right on the hero so the modal stays closable while the body scrolls. */
  onClose?: () => void;
};

/**
 * Read-only preview hero for persisted tasks: full 16:9 frame, cover with `object-contain` (full aspect ratio),
 * title + description overlay. Editable fields live in Details below.
 */
export function TaskModalHero({
  title,
  description,
  coverPath,
  className,
  onClose,
}: TaskModalHeroProps) {
  const path = coverPath?.trim() || null;
  const { url, loading } = useTaskCardCoverUrl(path);
  const hasImage = Boolean(path);
  const showOverlay = hasImage && url;
  const titleText = title.trim() || 'Untitled';
  const descText = description.trim();

  return (
    <div className={cn('shrink-0 border-b border-border px-6 pb-4 pt-3', className)}>
      <div
        className={cn(
          'relative isolate overflow-hidden rounded-xl border border-border/60 bg-muted',
          'aspect-video w-full',
        )}
      >
        {onClose ? (
          <button
            type="button"
            className={cn(
              'absolute right-2 top-2 z-20 rounded-lg border p-2 shadow-sm transition-colors',
              showOverlay
                ? 'border-white/25 bg-black/45 text-white hover:bg-black/60'
                : 'border-border/60 bg-card/95 text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
            aria-label="Close"
            onClick={onClose}
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        ) : null}

        {hasImage && loading && !url ? (
          <div className="absolute inset-0 animate-pulse bg-muted" aria-hidden />
        ) : null}

        {hasImage && url ? (
          <>
            <img
              src={url}
              alt=""
              className="absolute inset-0 h-full w-full object-contain object-center"
            />
            <div
              className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/65 via-black/30 to-black/50"
              aria-hidden
            />
          </>
        ) : null}

        <div
          className={cn(
            'relative z-10 flex h-full min-h-0 flex-col justify-start p-4',
            showOverlay ? 'text-white' : 'text-foreground',
          )}
        >
          <p
            className={cn(
              'font-semibold leading-snug line-clamp-2',
              showOverlay && '[text-shadow:0_1px_2px_rgba(0,0,0,0.45)]',
            )}
          >
            {titleText}
          </p>
          {descText ? (
            <p
              className={cn(
                'mt-1 line-clamp-4 text-sm leading-relaxed',
                showOverlay
                  ? 'text-white/90 [text-shadow:0_1px_2px_rgba(0,0,0,0.35)]'
                  : 'text-muted-foreground',
              )}
            >
              {descText}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
