import type { VideoLibraryAccessScope } from '@/lib/video-library/publish';

export type VideoLibraryListItem = {
  id: string;
  title: string | null;
  access_scope: VideoLibraryAccessScope;
  published_at: string;
  published_by: string;
  class_instance_id: string;
  /** Fallback display when title is null */
  offeringName: string | null;
};

export type VideoLibraryCoachFilter = 'all' | 'mine' | 'public';

export type AccessScopeBadge = {
  label: string;
  icon: 'globe' | 'users' | 'lock';
};

export function isVideoLibraryBubble(
  b:
    | {
        name: string;
        metadata?: unknown;
      }
    | null
    | undefined,
): boolean {
  if (!b) return false;
  const m = b.metadata;
  if (
    m &&
    typeof m === 'object' &&
    !Array.isArray(m) &&
    (m as { kind?: unknown }).kind === 'video_library'
  ) {
    return true;
  }
  return b.name.trim() === 'Video Library';
}

export function publicationDisplayTitle(
  item: Pick<VideoLibraryListItem, 'title' | 'offeringName'>,
): string {
  const title = item.title?.trim();
  if (title) return title;
  const offering = item.offeringName?.trim();
  if (offering) return offering;
  return 'Untitled recording';
}

export function accessScopeBadge(scope: VideoLibraryAccessScope): AccessScopeBadge {
  if (scope === 'public_storefront') return { label: 'Public', icon: 'globe' };
  if (scope === 'bubble_members') return { label: 'Private', icon: 'lock' };
  return { label: 'Workspace', icon: 'users' };
}

export function filterLibraryItems(
  items: VideoLibraryListItem[],
  filter: VideoLibraryCoachFilter,
  userId: string | null,
): VideoLibraryListItem[] {
  if (filter === 'mine') {
    if (!userId) return [];
    return items.filter((i) => i.published_by === userId);
  }
  if (filter === 'public') {
    return items.filter((i) => i.access_scope === 'public_storefront');
  }
  return items;
}

/** Normalize Supabase nested offering name (object or single-element array). */
export function offeringNameFromEmbed(nested: unknown): string | null {
  if (!nested || typeof nested !== 'object') return null;
  const o = nested as Record<string, unknown>;
  const offerings = o.class_offerings ?? o;
  const row = Array.isArray(offerings) ? offerings[0] : offerings;
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
  const name = (row as { name?: unknown }).name;
  return typeof name === 'string' && name.trim() ? name.trim() : null;
}

export function parseAccessScope(raw: unknown): VideoLibraryAccessScope | null {
  if (raw === 'workspace' || raw === 'bubble_members' || raw === 'public_storefront') {
    return raw;
  }
  return null;
}
