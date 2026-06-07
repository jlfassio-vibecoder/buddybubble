export function metadataBlocks(
  itemType: string,
  meta: unknown,
): { label: string; value: string }[] {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return [];
  const m = meta as Record<string, unknown>;
  const str = (k: string) => (typeof m[k] === 'string' ? (m[k] as string).trim() : '');
  const it = itemType.toLowerCase();

  if (it === 'event') {
    const out: { label: string; value: string }[] = [];
    const loc = str('location');
    const url = str('url');
    if (loc) out.push({ label: 'Location', value: loc });
    if (url) out.push({ label: 'Link', value: url });
    return out;
  }

  if (it === 'experience') {
    const season = str('season');
    const horizon = str('horizon');
    const end = str('end_date');
    const parts: string[] = [];
    if (season) parts.push(season);
    if (horizon) parts.push(horizon);
    if (end) parts.push(`Ends ${end.slice(0, 10)}`);
    if (parts.length === 0) return [];
    return [{ label: 'Season / horizon', value: parts.join(' · ') }];
  }

  if (it === 'memory') {
    const caption = str('caption');
    if (!caption) return [];
    return [{ label: 'Caption', value: caption }];
  }

  return [];
}
