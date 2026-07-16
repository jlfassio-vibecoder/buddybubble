export type PublicVideoCardData = {
  publicationId: string;
  title: string;
  publishedAt: string;
};

function offeringNameFromEmbed(nested: unknown): string | null {
  if (!nested || typeof nested !== 'object') return null;
  const o = nested as Record<string, unknown>;
  const offerings = o.class_offerings ?? o;
  const row = Array.isArray(offerings) ? offerings[0] : offerings;
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
  const name = (row as { name?: unknown }).name;
  return typeof name === 'string' && name.trim() ? name.trim() : null;
}

function isReadyRecording(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return false;
  const raw = (metadata as Record<string, unknown>).class_recording;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  const r = raw as Record<string, unknown>;
  if (r.type !== 'class_recording' || r.status !== 'ready') return false;
  const path = typeof r.storagePath === 'string' ? r.storagePath.trim() : '';
  const url = typeof r.playbackUrl === 'string' ? r.playbackUrl.trim() : '';
  return Boolean(path || url);
}

export function publicationDisplayTitle(title: string | null, offeringName: string | null): string {
  const t = title?.trim();
  if (t) return t;
  const o = offeringName?.trim();
  if (o) return o;
  return 'Untitled recording';
}

/** Map SSR publication rows into island-safe card data. */
export function mapPublicVideoPublications(rows: unknown[]): PublicVideoCardData[] {
  const out: PublicVideoCardData[] = [];
  for (const raw of rows) {
    if (!raw || typeof raw !== 'object') continue;
    const row = raw as Record<string, unknown>;
    const publicationId = typeof row.id === 'string' ? row.id : '';
    const publishedAt = typeof row.published_at === 'string' ? row.published_at : '';
    if (!publicationId || !publishedAt) continue;

    let instance: Record<string, unknown> | null = null;
    const nested = row.class_instances;
    if (Array.isArray(nested)) {
      instance =
        nested[0] && typeof nested[0] === 'object' ? (nested[0] as Record<string, unknown>) : null;
    } else if (nested && typeof nested === 'object') {
      instance = nested as Record<string, unknown>;
    }

    if (instance && !isReadyRecording(instance.metadata)) {
      continue;
    }

    const offeringName = instance ? offeringNameFromEmbed(instance) : null;
    const title = publicationDisplayTitle(
      typeof row.title === 'string' ? row.title : null,
      offeringName,
    );

    out.push({ publicationId, title, publishedAt });
  }
  return out;
}
