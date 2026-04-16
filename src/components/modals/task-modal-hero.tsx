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
  /**
   * When a cover image is loaded, the hero defaults to a tall 16:9 frame. Set true (e.g. after
   * the user uses type/visibility chrome) to use the compact header so more of the modal is
   * visible below.
   */
  compactCinematic?: boolean;
};

const closeButtonBase =
  'shrink-0 rounded-lg border p-2 shadow-sm transition-colors outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';

/**
 * Read-only preview hero for persisted tasks: when a cover image is available, a full 16:9
 * frame with `object-contain` and title + description overlay. Without an image (or while
 * loading / if signing fails), a compact header so the modal does not reserve a large empty
 * grey area. Editable fields live in Details below.
 */
export function TaskModalHero({
  title,
  description,
  coverPath,
  className,
  onClose,
  compactCinematic = false,
}: TaskModalHeroProps) {
  const path = coverPath?.trim() || null;
  const { url, loading } = useTaskCardCoverUrl(path);
  const hasPath = Boolean(path);
  const coverUrl = path && url ? url : null;
  const showImage = Boolean(coverUrl);
  const useCinematicLayout = showImage && !compactCinematic;
  const coverLoading = hasPath && loading && !url;
  const titleText = title.trim() || 'Untitled';
  const descText = description.trim();

  return (
    <div className={cn('shrink-0 border-b border-border px-6 pb-4 pt-3', className)}>
      <div
        className={cn(
          'relative isolate overflow-hidden rounded-xl border border-border/60',
          useCinematicLayout ? 'aspect-video w-full bg-muted' : 'w-full bg-card',
        )}
      >
        {useCinematicLayout ? (
          <>
            {onClose ? (
              <button
                type="button"
                className={cn(
                  closeButtonBase,
                  'absolute right-2 top-2 z-20',
                  'border-white/25 bg-black/45 text-white hover:bg-black/60',
                )}
                aria-label="Close"
                onClick={onClose}
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            ) : null}

            <img
              src={coverUrl ?? undefined}
              alt=""
              className="absolute inset-0 h-full w-full object-contain object-center"
            />
            <div
              className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/65 via-black/30 to-black/50"
              aria-hidden
            />

            <div className="relative z-10 flex h-full min-h-0 flex-col justify-start p-4 text-white">
              <p
                className={cn(
                  'line-clamp-2 font-semibold leading-snug',
                  '[text-shadow:0_1px_2px_rgba(0,0,0,0.45)]',
                )}
              >
                {titleText}
              </p>
              {descText ? (
                <p className="mt-1 line-clamp-4 text-sm leading-relaxed text-white/90 [text-shadow:0_1px_2px_rgba(0,0,0,0.35)]">
                  {descText}
                </p>
              ) : null}
            </div>
          </>
        ) : (
          <div className="flex items-start justify-between gap-3 p-4">
            <div className="min-w-0 flex-1 pr-2">
              <p className="line-clamp-2 font-semibold leading-snug text-foreground">{titleText}</p>
              {coverLoading ? (
                <div
                  className="mt-2 h-1.5 max-w-[7rem] animate-pulse rounded-full bg-muted"
                  aria-hidden
                />
              ) : null}
              {descText ? (
                <p className="mt-1 line-clamp-4 text-sm leading-relaxed text-muted-foreground">
                  {descText}
                </p>
              ) : null}
            </div>
            {onClose ? (
              <button
                type="button"
                className={cn(
                  closeButtonBase,
                  'border-border/60 bg-card text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
                aria-label="Close"
                onClick={onClose}
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
