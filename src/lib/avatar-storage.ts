export const AVATARS_BUCKET = 'avatars';

/** Matches RLS: public/{userId}-{timestamp}.{ext} */
export function buildAvatarObjectPath(userId: string, file: File): string {
  const raw = file.name.split('.').pop()?.toLowerCase() ?? '';
  const ext = raw && /^[a-z0-9]+$/.test(raw) ? raw : 'jpg';
  return `public/${userId}-${Date.now()}.${ext}`;
}
