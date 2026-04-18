'use client';

import { useState, type ReactNode } from 'react';
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
  /** When `descriptionCollapseMode` is `none`: show full description (scrollable) instead of line-clamp. */
  descriptionExpanded?: boolean;
  /**
   * Comments / thread focus: default to a short preview with Show more / less instead of a tall
   * always-expanded block. When set, `descriptionExpanded` is ignored for description layout.
   */
  descriptionCollapseMode?: 'none' | 'preview_toggle';
  /** Shown on the same row as the description toggle (e.g. compact Generate workout). */
  readingContextActions?: ReactNode;
};

const closeButtonBase =
  'shrink-0 rounded-lg border p-2 shadow-sm transition-colors outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';

const expandedPreviewMaxClass = 'max-h-[min(30vh,16rem)]';

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
  descriptionExpanded = false,
  descriptionCollapseMode = 'none',
  readingContextActions = null,
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

  const isPreviewToggle = descriptionCollapseMode === 'preview_toggle';
  const [descPreviewExpanded, setDescPreviewExpanded] = useState(false);

  const legacyExpanded = !isPreviewToggle && descriptionExpanded;
  const showDescToggleRow =
    Boolean(readingContextActions) || (isPreviewToggle && Boolean(descText));

  const titleClampClass = isPreviewToggle
    ? 'line-clamp-2'
    : legacyExpanded
      ? 'line-clamp-3'
      : 'line-clamp-2';

  const renderDescToggleRow = (variant: 'cinematic' | 'compact') => {
    if (!showDescToggleRow) return null;
    const btnBase =
      variant === 'cinematic'
        ? 'text-xs font-medium text-white/95 underline-offset-2 hover:underline [text-shadow:0_1px_2px_rgba(0,0,0,0.45)]'
        : 'text-xs font-medium text-primary underline-offset-2 hover:underline';

    return (
      <div
        className={cn(
          'mt-2 flex min-w-0 flex-wrap items-center justify-between gap-2',
          variant === 'cinematic' && 'pointer-events-auto',
        )}
      >
        {isPreviewToggle && descText ? (
          <button
            type="button"
            className={btnBase}
            aria-expanded={descPreviewExpanded}
            onClick={() => setDescPreviewExpanded((v) => !v)}
          >
            {descPreviewExpanded ? 'Show less' : 'Show more'}
          </button>
        ) : (
          <span className="min-w-0 flex-1" aria-hidden />
        )}
        {readingContextActions ? (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            {readingContextActions}
          </div>
        ) : null}
      </div>
    );
  };

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

            <div className="pointer-events-none relative z-10 flex h-full min-h-0 flex-col justify-start overflow-hidden p-4 text-white">
              <p
                className={cn(
                  'pointer-events-auto font-semibold leading-snug [text-shadow:0_1px_2px_rgba(0,0,0,0.45)]',
                  titleClampClass,
                )}
              >
                {titleText}
              </p>
              {descText ? (
                <div
                  className={cn(
                    'pointer-events-auto mt-1 min-h-0',
                    isPreviewToggle
                      ? descPreviewExpanded
                        ? cn(expandedPreviewMaxClass, 'overflow-y-auto pr-1 custom-scrollbar')
                        : ''
                      : legacyExpanded
                        ? 'max-h-[min(42vh,22rem)] flex-1 overflow-y-auto pr-1 custom-scrollbar'
                        : 'flex-1',
                  )}
                >
                  <p
                    className={cn(
                      'text-sm leading-relaxed [text-shadow:0_1px_2px_rgba(0,0,0,0.35)]',
                      isPreviewToggle
                        ? descPreviewExpanded
                          ? 'whitespace-pre-wrap text-white/90'
                          : 'line-clamp-3 text-white/90'
                        : legacyExpanded
                          ? 'whitespace-pre-wrap text-white/90'
                          : 'line-clamp-4 text-white/90',
                    )}
                  >
                    {descText}
                  </p>
                </div>
              ) : null}
              {renderDescToggleRow('cinematic')}
            </div>
          </>
        ) : (
          <div className="flex items-start justify-between gap-3 p-4">
            <div className="min-w-0 flex-1 pr-2">
              <p className={cn('font-semibold leading-snug text-foreground', titleClampClass)}>
                {titleText}
              </p>
              {coverLoading ? (
                <div
                  className="mt-2 h-1.5 max-w-[7rem] animate-pulse rounded-full bg-muted"
                  aria-hidden
                />
              ) : null}
              {descText ? (
                isPreviewToggle ? (
                  descPreviewExpanded ? (
                    <div
                      className={cn(
                        'mt-1 overflow-y-auto rounded-md border border-border/50 bg-muted/20 px-2 py-2 custom-scrollbar',
                        expandedPreviewMaxClass,
                      )}
                    >
                      <p className="text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground">
                        {descText}
                      </p>
                    </div>
                  ) : (
                    <p className="mt-1 line-clamp-3 text-sm leading-relaxed text-muted-foreground">
                      {descText}
                    </p>
                  )
                ) : legacyExpanded ? (
                  <div className="mt-1 max-h-[min(48vh,28rem)] overflow-y-auto rounded-md border border-border/50 bg-muted/20 px-2 py-2 custom-scrollbar">
                    <p className="text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground">
                      {descText}
                    </p>
                  </div>
                ) : (
                  <p className="mt-1 line-clamp-4 text-sm leading-relaxed text-muted-foreground">
                    {descText}
                  </p>
                )
              ) : null}
              {renderDescToggleRow('compact')}
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
