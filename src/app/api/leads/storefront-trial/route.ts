/**
 * POST /api/leads/storefront-trial
 *
 * Zero-trust storefront intake: resolves workspace by **public_slug** + **is_public**,
 * creates or links an auth user, upserts **guest** membership with trial window,
 * provisions a **private trial** bubble + **bubble_members** (guest editor, coach editor),
 * inserts **leads** (storefront source), emits **lead_captured** server-side only.
 *
 * @see docs/tdd-lead-onboarding.md §10
 */

import { NextResponse } from 'next/server';
import { getClientIpFromRequest } from '@/lib/client-ip';
import { createServiceRoleClient } from '@/lib/supabase-service-role';
import { isTurnstileSecretConfigured, verifyTurnstileToken } from '@/lib/turnstile-verify';
import { trackWorkspaceLeadCaptured } from '@/lib/lead-capture-analytics';
import { getCanonicalOrigin } from '@/lib/app-url';
import { isStorefrontLeadSource, type StorefrontLeadSource } from '@/lib/leads-source';
import { mapStorefrontProfileToFitnessProfileUpsert } from '@/lib/storefront-trial-fitness-profile';
import { scheduleStorefrontTrialWorkoutAfterResponse } from '@/lib/storefront-trial-job';
import {
  insertTrialWorkoutTaskFromPreview,
  setBubbleWorkoutGenerationStatus,
  trialBubbleNeedsStorefrontWorkout,
} from '@/lib/storefront-trial-workout-task';
import { validateStorefrontPreviewPayload } from '@/lib/workout-factory/storefront-preview-runner';
import {
  createTrialBubbleAndMembers,
  findExistingStorefrontTrial,
  mergeLeadMetadataWithTrialBubble,
  resolveStorefrontCoachUserId,
} from '@/lib/storefront-trial-isolation';
import { sendStorefrontTrialLoginEmail } from '@/lib/storefront-trial-login-email';
import type { Json, MemberRole } from '@/types/database';

export const maxDuration = 300;

const MAX_PROFILE_JSON_BYTES = 100_000;
const MAX_CACHED_WORKOUT_JSON_BYTES = 100_000;

function normalizeUtmParams(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === 'string') out[k] = v;
    else if (v != null) out[k] = String(v);
  }
  return out;
}

type TrialBody = {
  publicSlug?: string;
  email?: string;
  source?: string;
  utmParams?: Record<string, string>;
  profile?: unknown;
  /** Validated storefront Vertex preview; when present and valid, intake inserts the workout task synchronously (BYOD). */
  cachedWorkoutData?: unknown;
  turnstileToken?: string;
};

function trialExpiresIso(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 3);
  return d.toISOString();
}

function trialDeepLinkPath(workspaceId: string, trialBubbleId: string): string {
  return `/app/${workspaceId}?bubble=${encodeURIComponent(trialBubbleId)}`;
}

function trimDisplayNameCandidate(raw: string): string {
  const t = raw.trim();
  if (!t) return '';
  return t.length > 120 ? t.slice(0, 120) : t;
}

/**
 * `handle_new_user` seeds `public.users.full_name` from auth `raw_user_meta_data` keys.
 * Storefront-created accounts previously omitted metadata, leaving `full_name` empty locally and
 * blocking the post-login dashboard until ProfileCompletionModal — production users often already
 * have metadata from other flows.
 */
function deriveStorefrontTrialDisplayName(email: string, profile: unknown): string {
  if (
    profile !== undefined &&
    profile !== null &&
    typeof profile === 'object' &&
    !Array.isArray(profile)
  ) {
    const o = profile as Record<string, unknown>;
    const fromDisplay =
      typeof o.display_name === 'string'
        ? o.display_name
        : typeof o.displayName === 'string'
          ? o.displayName
          : '';
    const fromName = typeof o.name === 'string' ? o.name : '';
    const fromFirst =
      typeof o.first_name === 'string'
        ? o.first_name
        : typeof o.firstName === 'string'
          ? o.firstName
          : '';
    const fromLast =
      typeof o.last_name === 'string'
        ? o.last_name
        : typeof o.lastName === 'string'
          ? o.lastName
          : '';
    const combined = [fromFirst, fromLast]
      .map((s) => s.trim())
      .filter(Boolean)
      .join(' ');
    const cand = trimDisplayNameCandidate(fromDisplay || fromName || combined);
    if (cand) return cand;
  }
  const local = email.includes('@') ? email.split('@')[0]! : email;
  const fallback = trimDisplayNameCandidate(local.replace(/[.+_]/g, ' ')) || 'Member';
  return fallback;
}

function requestOriginForAuth(req: Request): string {
  if (process.env.NODE_ENV === 'development') {
    const appUrl = process.env.APP_URL?.trim();
    if (appUrl) return appUrl;
    const u = new URL(req.url);
    return `${u.protocol}//${u.host}`;
  }
  return getCanonicalOrigin();
}

/**
 * Builds the one-time Supabase verify URL (`action_link`). Same idea as invite links: the URL is
 * the handoff — we return it as `next` for an immediate browser redirect. `generateLink` does not
 * send mail; optional duplicate email via Resend when configured (like copying an invite link vs
 * emailing it).
 *
 * `redirectTo` must be allowlisted in Supabase → Authentication → URL Configuration.
 * Use `/auth/callback?next=…`: PKCE (`code`) and `token_hash`+`type` are handled server-side; implicit
 * tokens in the URL hash are forwarded to `/login` by the callback route (fragment never hits the server).
 */
async function buildStorefrontTrialMagicLink(
  db: ReturnType<typeof createServiceRoleClient>,
  origin: string,
  email: string,
  workspaceId: string,
  trialBubbleId: string,
): Promise<string> {
  const nextPath = trialDeepLinkPath(workspaceId, trialBubbleId);
  const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent(nextPath)}`;

  const { data, error } = await db.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: { redirectTo },
  });

  if (error) {
    console.error('[leads/storefront-trial] generateLink', error.message);
    throw new Error('Could not create sign-in link');
  }

  const actionLink = data?.properties?.action_link;
  if (typeof actionLink !== 'string' || !actionLink.startsWith('http')) {
    console.error('[leads/storefront-trial] generateLink missing action_link');
    throw new Error('Could not create sign-in link');
  }

  return normalizeMagicLinkForDev(actionLink, redirectTo);
}

/**
 * Supabase may fall back to project Site URL when redirectTo is not accepted.
 * In local development we force the action link redirect target to local origin
 * so Open App always returns to the local app flow.
 */
function normalizeMagicLinkForDev(actionLink: string, redirectTo: string): string {
  if (process.env.NODE_ENV !== 'development') return actionLink;
  const appUrl = process.env.APP_URL?.trim();
  if (!appUrl) return actionLink;
  try {
    const wantedOrigin = new URL(appUrl).origin;
    const desiredRedirectTo = new URL(redirectTo);
    const wantedUrl = new URL(wantedOrigin);
    desiredRedirectTo.protocol = wantedUrl.protocol;
    desiredRedirectTo.host = wantedUrl.host;

    const u = new URL(actionLink);
    // Keep Supabase verify host intact; force only the post-verify handoff target.
    u.searchParams.set('redirect_to', desiredRedirectTo.toString());
    return u.toString();
  } catch {
    return actionLink;
  }
}

/** Best-effort duplicate to inbox when Resend is configured; never blocks the redirect flow. */
async function maybeEmailStorefrontTrialLoginDuplicate(
  to: string,
  magicLinkUrl: string,
): Promise<void> {
  if (!process.env.RESEND_API_KEY?.trim() || !process.env.RESEND_FROM?.trim()) return;
  const r = await sendStorefrontTrialLoginEmail({ to, magicLinkUrl });
  if (r.error) {
    console.warn('[leads/storefront-trial] optional login email not sent:', r.error);
  }
}

async function upsertFitnessProfileFromStorefrontIfApplicable(
  db: ReturnType<typeof createServiceRoleClient>,
  workspaceId: string,
  userId: string,
  categoryType: string,
  profile: unknown,
): Promise<void> {
  if (categoryType !== 'fitness') return;
  const mapped = mapStorefrontProfileToFitnessProfileUpsert(profile);
  if (!mapped) return;
  const now = new Date().toISOString();
  const { error } = await db.from('fitness_profiles').upsert(
    {
      workspace_id: workspaceId,
      user_id: userId,
      ...mapped,
      updated_at: now,
    },
    { onConflict: 'workspace_id,user_id' },
  );
  if (error) {
    console.error(
      '[leads/storefront-trial] fitness_profiles upsert',
      error.message || 'Unknown error',
    );
  }
}

function normalizeCachedWorkoutForIntake(
  raw: unknown,
): { ok: true; data: unknown } | { ok: false; status: number; error: string } {
  if (raw === undefined || raw === null) {
    return { ok: true, data: undefined };
  }
  let encoded = 0;
  try {
    encoded = new TextEncoder().encode(JSON.stringify(raw)).length;
  } catch {
    return { ok: false, status: 400, error: 'cachedWorkoutData must be JSON-serializable' };
  }
  if (encoded > MAX_CACHED_WORKOUT_JSON_BYTES) {
    return { ok: false, status: 413, error: 'cachedWorkoutData payload too large' };
  }
  const v = validateStorefrontPreviewPayload(raw);
  if (!v.ok) {
    console.warn('[leads/storefront-trial] ignoring invalid cachedWorkoutData', v.error);
    return { ok: true, data: undefined };
  }
  return { ok: true, data: raw };
}

async function provisionStorefrontTrialWorkout(
  db: ReturnType<typeof createServiceRoleClient>,
  opts: {
    workspaceId: string;
    userId: string;
    trialBubbleId: string;
    leadId: string;
    categoryType: string;
    cachedWorkoutData: unknown | undefined;
  },
): Promise<void> {
  if (opts.categoryType !== 'fitness') {
    return;
  }

  const needs = await trialBubbleNeedsStorefrontWorkout(db, opts.trialBubbleId, opts.userId);
  if (!needs) {
    await setBubbleWorkoutGenerationStatus(db, opts.trialBubbleId, 'completed');
    return;
  }

  if (opts.cachedWorkoutData !== undefined && opts.cachedWorkoutData !== null) {
    const v = validateStorefrontPreviewPayload(opts.cachedWorkoutData);
    if (!v.ok) {
      await setBubbleWorkoutGenerationStatus(db, opts.trialBubbleId, 'pending');
      await scheduleStorefrontTrialWorkoutAfterResponse({
        workspaceId: opts.workspaceId,
        userId: opts.userId,
        leadId: opts.leadId,
        trialBubbleId: opts.trialBubbleId,
      });
      return;
    }
    const inserted = await insertTrialWorkoutTaskFromPreview(db, {
      trialBubbleId: opts.trialBubbleId,
      userId: opts.userId,
      workspaceId: opts.workspaceId,
      preview: v.preview,
    });
    if (!inserted) {
      await setBubbleWorkoutGenerationStatus(db, opts.trialBubbleId, 'failed', {
        error_message: 'Could not insert workout from cached preview',
      });
      return;
    }
    await setBubbleWorkoutGenerationStatus(db, opts.trialBubbleId, 'completed');
    return;
  }

  await setBubbleWorkoutGenerationStatus(db, opts.trialBubbleId, 'pending');
  await scheduleStorefrontTrialWorkoutAfterResponse({
    workspaceId: opts.workspaceId,
    userId: opts.userId,
    leadId: opts.leadId,
    trialBubbleId: opts.trialBubbleId,
  });
}

export async function POST(req: Request) {
  try {
    let body: TrialBody;
    try {
      body = (await req.json()) as TrialBody;
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const publicSlug =
      typeof body.publicSlug === 'string' ? body.publicSlug.trim().toLowerCase() : '';
    if (!publicSlug) {
      return NextResponse.json({ error: 'publicSlug is required' }, { status: 400 });
    }

    const emailRaw = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!emailRaw || !emailRaw.includes('@')) {
      return NextResponse.json({ error: 'A valid email is required' }, { status: 400 });
    }

    const sourceRaw = typeof body.source === 'string' ? body.source.trim() : '';
    if (!isStorefrontLeadSource(sourceRaw)) {
      return NextResponse.json(
        { error: 'source must be storefront_organic or storefront_paid' },
        { status: 400 },
      );
    }
    const source = sourceRaw as StorefrontLeadSource;

    if (body.profile !== undefined) {
      let encoded = 0;
      try {
        encoded = new TextEncoder().encode(JSON.stringify(body.profile)).length;
      } catch {
        return NextResponse.json({ error: 'profile must be JSON-serializable' }, { status: 400 });
      }
      if (encoded > MAX_PROFILE_JSON_BYTES) {
        return NextResponse.json({ error: 'profile payload too large' }, { status: 413 });
      }
    }

    const utmParams = normalizeUtmParams(body.utmParams);

    let clientIp = getClientIpFromRequest(req);
    if (!clientIp && process.env.NODE_ENV === 'development') {
      clientIp = '127.0.0.1';
    }

    const turnstileToken =
      typeof body.turnstileToken === 'string' ? body.turnstileToken.trim() : '';
    // Local dev defaults to bypass so lead capture works before Turnstile is fully wired.
    // Set ALLOW_STOREFRONT_PREVIEW_WITHOUT_TURNSTILE=0 to force verification locally.
    const devTurnstileBypass =
      process.env.NODE_ENV === 'development' &&
      process.env.ALLOW_STOREFRONT_PREVIEW_WITHOUT_TURNSTILE !== '0';

    if (!devTurnstileBypass) {
      if (!isTurnstileSecretConfigured()) {
        return NextResponse.json(
          { error: 'Trial intake is temporarily unavailable' },
          { status: 503 },
        );
      }
      if (!turnstileToken) {
        return NextResponse.json({ error: 'turnstileToken is required' }, { status: 400 });
      }
      if (!clientIp) {
        return NextResponse.json({ error: 'Could not verify client' }, { status: 403 });
      }
      const tv = await verifyTurnstileToken({ token: turnstileToken, remoteip: clientIp });
      if (!tv.ok) {
        return NextResponse.json({ error: tv.error }, { status: tv.status });
      }
    }

    const cachedNorm = normalizeCachedWorkoutForIntake(body.cachedWorkoutData);
    if (!cachedNorm.ok) {
      return NextResponse.json({ error: cachedNorm.error }, { status: cachedNorm.status });
    }
    const cachedWorkoutForIntake = cachedNorm.data;

    const db = createServiceRoleClient();

    const { data: ws, error: wsErr } = await db
      .from('workspaces')
      .select('id, category_type, is_public, public_slug')
      .eq('public_slug', publicSlug)
      .eq('is_public', true)
      .maybeSingle();

    if (wsErr) {
      console.error('[leads/storefront-trial] workspace query', wsErr.message || 'Unknown error');
      return NextResponse.json({ error: 'Failed to resolve workspace' }, { status: 500 });
    }
    if (!ws) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
    }

    const workspaceId = (ws as { id: string }).id;
    const categoryType = (ws as { category_type?: string }).category_type;
    if (!categoryType || !['business', 'fitness'].includes(categoryType)) {
      return NextResponse.json(
        { error: 'Storefront trial is not available for this workspace' },
        {
          status: 403,
        },
      );
    }

    const trialGuestDisplayName = deriveStorefrontTrialDisplayName(emailRaw, body.profile);

    let userId: string;
    const { data: existingProfile } = await db
      .from('users')
      .select('id')
      .eq('email', emailRaw)
      .maybeSingle();
    if (existingProfile?.id) {
      userId = existingProfile.id as string;
    } else {
      // Copilot suggestion ignored: auto-confirm keeps storefront trial → login redirect frictionless; verified-email / magic-link hardening is tracked separately (docs/tdd-lead-onboarding.md).
      const { data: created, error: authErr } = await db.auth.admin.createUser({
        email: emailRaw,
        email_confirm: true,
        user_metadata: { full_name: trialGuestDisplayName },
      });
      if (authErr || !created?.user?.id) {
        const msg = (authErr?.message ?? '').toLowerCase();
        if (msg.includes('already') || msg.includes('registered')) {
          const { data: again } = await db
            .from('users')
            .select('id')
            .eq('email', emailRaw)
            .maybeSingle();
          if (!again?.id) {
            console.error(
              '[leads/storefront-trial] race: user exists but no public.users row',
              authErr?.message || 'Unknown error',
            );
            return NextResponse.json({ error: 'Could not resolve user account' }, { status: 500 });
          }
          userId = again.id as string;
        } else {
          console.error('[leads/storefront-trial] createUser', authErr?.message || 'Unknown error');
          return NextResponse.json({ error: 'Could not create user account' }, { status: 500 });
        }
      } else {
        userId = created.user.id;
      }
    }

    const { data: userRow } = await db
      .from('users')
      .select('full_name')
      .eq('id', userId)
      .maybeSingle();
    const existingFullName =
      typeof (userRow as { full_name?: string } | null)?.full_name === 'string'
        ? (userRow as { full_name: string }).full_name.trim()
        : '';
    if (!existingFullName) {
      const { error: nameErr } = await db
        .from('users')
        .update({ full_name: trialGuestDisplayName })
        .eq('id', userId);
      if (nameErr) {
        console.error(
          '[leads/storefront-trial] users full_name backfill',
          nameErr.message || 'Unknown error',
        );
      }
    }

    const { data: membership } = await db
      .from('workspace_members')
      .select('role, trial_expires_at')
      .eq('workspace_id', workspaceId)
      .eq('user_id', userId)
      .maybeSingle();

    const existingRole = (membership as { role?: MemberRole } | null)?.role;
    const existingTrialExpires = (membership as { trial_expires_at?: string | null } | null)
      ?.trial_expires_at;
    if (existingRole && existingRole !== 'guest') {
      return NextResponse.json(
        { error: 'This account is already a member of this workspace.' },
        { status: 409 },
      );
    }

    const trialEnd =
      typeof existingTrialExpires === 'string' && existingTrialExpires.trim() !== ''
        ? existingTrialExpires
        : trialExpiresIso();
    const { error: memErr } = await db.from('workspace_members').upsert(
      {
        workspace_id: workspaceId,
        user_id: userId,
        role: 'guest',
        trial_expires_at: trialEnd,
        onboarding_status: 'trial_active',
      },
      { onConflict: 'workspace_id,user_id' },
    );
    if (memErr) {
      console.error(
        '[leads/storefront-trial] workspace_members upsert',
        memErr.message || 'Unknown error',
      );
      return NextResponse.json({ error: 'Failed to save membership' }, { status: 500 });
    }

    const origin = requestOriginForAuth(req);
    const now = new Date().toISOString();

    const existing = await findExistingStorefrontTrial(db, workspaceId, userId);
    if (existing) {
      await db.from('leads').update({ last_seen_at: now }).eq('id', existing.leadId);

      if (body.profile !== undefined) {
        await upsertFitnessProfileFromStorefrontIfApplicable(
          db,
          workspaceId,
          userId,
          categoryType,
          body.profile,
        );
      }

      await provisionStorefrontTrialWorkout(db, {
        workspaceId,
        userId,
        trialBubbleId: existing.trialBubbleId,
        leadId: existing.leadId,
        categoryType,
        cachedWorkoutData: cachedWorkoutForIntake,
      });

      const next = await buildStorefrontTrialMagicLink(
        db,
        origin,
        emailRaw,
        workspaceId,
        existing.trialBubbleId,
      );
      void maybeEmailStorefrontTrialLoginDuplicate(emailRaw, next);
      return NextResponse.json({
        ok: true,
        workspaceId,
        leadId: existing.leadId,
        userId,
        trialBubbleId: existing.trialBubbleId,
        next,
        idempotent: true,
      });
    }

    const coach = await resolveStorefrontCoachUserId(db, workspaceId);
    if ('error' in coach) {
      return NextResponse.json(
        { error: 'Workspace is not configured for trials' },
        { status: 500 },
      );
    }

    const bubbleResult = await createTrialBubbleAndMembers({
      db,
      workspaceId,
      guestUserId: userId,
      coachUserId: coach.coachUserId,
      emailForName: emailRaw,
    });
    if ('error' in bubbleResult) {
      return NextResponse.json({ error: bubbleResult.error }, { status: 500 });
    }
    const { trialBubbleId } = bubbleResult;

    const baseMetadata: Json = {
      acquisition: 'storefront',
      public_slug: publicSlug,
      ...(body.profile !== undefined ? { profile: body.profile as Json } : {}),
    };
    const metadata = mergeLeadMetadataWithTrialBubble(baseMetadata, trialBubbleId) as Json;

    const { data: lead, error: leadErr } = await db
      .from('leads')
      .insert({
        workspace_id: workspaceId,
        invite_token: null,
        source,
        email: emailRaw,
        utm_params: utmParams,
        first_seen_at: now,
        last_seen_at: now,
        user_id: userId,
        metadata,
      })
      .select('id')
      .single();

    if (leadErr || !lead) {
      console.error('[leads/storefront-trial] leads insert', leadErr?.message || 'Unknown error');
      await db.from('bubble_members').delete().eq('bubble_id', trialBubbleId);
      await db.from('bubbles').delete().eq('id', trialBubbleId);
      return NextResponse.json({ error: 'Failed to record lead' }, { status: 500 });
    }

    const leadId = lead.id as string;

    void trackWorkspaceLeadCaptured({
      workspaceId,
      leadId,
      source,
      inviteToken: null,
      utmParams,
    });

    if (body.profile !== undefined) {
      await upsertFitnessProfileFromStorefrontIfApplicable(
        db,
        workspaceId,
        userId,
        categoryType,
        body.profile,
      );
    }

    await provisionStorefrontTrialWorkout(db, {
      workspaceId,
      userId,
      trialBubbleId,
      leadId,
      categoryType,
      cachedWorkoutData: cachedWorkoutForIntake,
    });

    const next = await buildStorefrontTrialMagicLink(
      db,
      origin,
      emailRaw,
      workspaceId,
      trialBubbleId,
    );
    void maybeEmailStorefrontTrialLoginDuplicate(emailRaw, next);

    return NextResponse.json({
      ok: true,
      workspaceId,
      leadId,
      userId,
      trialBubbleId,
      next,
    });
  } catch (e) {
    console.error('[leads/storefront-trial]', e instanceof Error ? e.message : 'Unknown error');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
