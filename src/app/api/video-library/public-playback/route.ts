import { NextResponse } from 'next/server';
import { CLASS_RECORDINGS_BUCKET } from '@/lib/class-recording-storage';
import { isUuidString } from '@/lib/is-uuid';
import { createServiceRoleClient } from '@/lib/supabase-service-role';
import {
  PUBLIC_PLAYBACK_SIGNED_URL_TTL_SEC,
  assertPublicPublicationPlayback,
} from '@/lib/video-library/public-playback';

/**
 * GET /api/video-library/public-playback?publicationId=<uuid>
 *
 * Anonymous storefront playback: hard-checks public_storefront publication gates,
 * then mints a short-lived signed URL from the private class-recordings bucket.
 */
export async function GET(request: Request) {
  const publicationId = new URL(request.url).searchParams.get('publicationId')?.trim() ?? '';
  if (!publicationId || !isUuidString(publicationId)) {
    return NextResponse.json({ error: 'Invalid publication id.' }, { status: 400 });
  }

  const notFound = () => NextResponse.json({ error: 'Not found.' }, { status: 404 });

  let supabase;
  try {
    supabase = createServiceRoleClient();
  } catch (e) {
    console.error(
      '[video-library/public-playback] service_role_client_init_failed',
      e instanceof Error ? e.message : e,
    );
    return NextResponse.json({ error: 'Playback unavailable.' }, { status: 503 });
  }

  const { data, error } = await supabase
    .from('video_library_publications')
    .select(
      `
      unpublished_at,
      access_scope,
      workspaces!inner ( is_public ),
      class_instances!inner ( metadata )
    `,
    )
    .eq('id', publicationId)
    .maybeSingle();

  if (error) {
    console.error('[video-library/public-playback] query_failed', error.message);
    return notFound();
  }
  if (!data) return notFound();

  const row = data as {
    unpublished_at: string | null;
    access_scope: string;
    workspaces: { is_public: boolean } | { is_public: boolean }[] | null;
    class_instances: { metadata: unknown } | { metadata: unknown }[] | null;
  };

  const workspace = Array.isArray(row.workspaces) ? row.workspaces[0] : row.workspaces;
  const instance = Array.isArray(row.class_instances)
    ? row.class_instances[0]
    : row.class_instances;

  const source = assertPublicPublicationPlayback({
    unpublished_at: row.unpublished_at,
    access_scope: row.access_scope,
    workspace_is_public: workspace?.is_public === true,
    class_instance_metadata: instance?.metadata ?? null,
  });

  if (!source) return notFound();

  if (source.kind === 'playbackUrl') {
    return NextResponse.json({
      ok: true,
      url: source.playbackUrl,
      expiresIn: PUBLIC_PLAYBACK_SIGNED_URL_TTL_SEC,
    });
  }

  const { data: signed, error: signErr } = await supabase.storage
    .from(CLASS_RECORDINGS_BUCKET)
    .createSignedUrl(source.storagePath, PUBLIC_PLAYBACK_SIGNED_URL_TTL_SEC);

  if (signErr || !signed?.signedUrl) {
    console.error(
      '[video-library/public-playback] sign_failed',
      signErr?.message ?? 'missing signedUrl',
    );
    return notFound();
  }

  return NextResponse.json({
    ok: true,
    url: signed.signedUrl,
    expiresIn: PUBLIC_PLAYBACK_SIGNED_URL_TTL_SEC,
  });
}
