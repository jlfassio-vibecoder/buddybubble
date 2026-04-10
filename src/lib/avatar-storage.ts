export const AVATARS_BUCKET = 'avatars';

/** Matches RLS: public/{userId}-{timestamp}.{ext} */
export function buildAvatarObjectPath(userId: string, file: File): string {
  const raw = file.name.split('.').pop()?.toLowerCase() ?? '';
  const ext = raw && /^[a-z0-9]+$/.test(raw) ? raw : 'jpg';
  return `public/${userId}-${Date.now()}.${ext}`;
}

/**
 * Extract the storage object path from a Supabase public avatar URL.
 * Returns `null` if the URL does not match the expected format.
 *
 * URL pattern:
 *   https://{ref}.supabase.co/storage/v1/object/public/avatars/{path}
 */
export function extractAvatarObjectPath(publicUrl: string): string | null {
  const marker = `/object/public/${AVATARS_BUCKET}/`;
  const idx = publicUrl.indexOf(marker);
  if (idx === -1) return null;
  return publicUrl.slice(idx + marker.length);
}
