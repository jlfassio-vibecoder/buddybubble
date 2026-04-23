'use server';

import { createClient } from '@utils/supabase/server';
import { formatUserFacingError } from '@/lib/format-error';
import { isMissingColumnSchemaCacheError } from '@/lib/supabase-schema-errors';
import type { Json } from '@/types/database.generated';

export type UpdateWorkspaceSettingsInput = {
  workspaceId: string;
  calendar_timezone: string;
  is_public: boolean;
  /** Trimmed segment or null to clear */
  public_slug: string | null;
  /** Normalized host or null to clear */
  custom_domain: string | null;
  /**
   * When provided, merges into `workspaces.metadata` (e.g. `lead_alert_phone`).
   * Omit when the client is not managing lead alerts.
   */
  lead_alert_phone?: string | null;
  /** Minutes; merged into `metadata.lead_inactivity_timeout` as an integer. */
  lead_inactivity_timeout?: number;
  /** Minutes; merged into `metadata.member_inactivity_timeout` as an integer. */
  member_inactivity_timeout?: number;
};

export type UpdateWorkspaceSettingsResult = { ok: true } | { error: string };

const RESERVED_SLUGS = new Set([
  'app',
  'api',
  'admin',
  'login',
  'logout',
  'auth',
  'invite',
  'onboarding',
  'demo',
  'www',
  'static',
  'assets',
  'cdn',
]);

function normalizeSlug(raw: string | null | undefined): string | null {
  const t = String(raw ?? '')
    .trim()
    .toLowerCase();
  return t.length === 0 ? null : t;
}

function normalizeDomain(raw: string | null | undefined): string | null {
  const t = String(raw ?? '')
    .trim()
    .toLowerCase();
  return t.length === 0 ? null : t;
}

const LEAD_INACTIVITY_TIMEOUT_MINUTES = new Set([2, 5, 10, 30]);
const MEMBER_INACTIVITY_TIMEOUT_MINUTES = new Set([15, 30, 60, 720, 1440]);

function mergeLeadAlertsMetadata(
  existing: Json,
  patch: {
    leadPhone?: string | null;
    leadInactivityTimeout?: number;
    memberInactivityTimeout?: number;
  },
): Json {
  const base =
    existing && typeof existing === 'object' && !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {};
  if (patch.leadPhone !== undefined) {
    if (patch.leadPhone === null || patch.leadPhone === '') {
      delete base.lead_alert_phone;
    } else {
      base.lead_alert_phone = patch.leadPhone;
    }
  }
  if (patch.leadInactivityTimeout !== undefined) {
    base.lead_inactivity_timeout = patch.leadInactivityTimeout;
  }
  if (patch.memberInactivityTimeout !== undefined) {
    base.member_inactivity_timeout = patch.memberInactivityTimeout;
  }
  return base as Json;
}

function validatePublicSlug(slug: string | null): string | null {
  if (slug === null) return null;
  if (slug.length > 120) return 'Public URL slug is too long.';
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return 'Use lowercase letters, numbers, and single hyphens only (no spaces or special characters).';
  }
  if (RESERVED_SLUGS.has(slug)) {
    return `The slug "${slug}" is reserved. Pick a different one.`;
  }
  return null;
}

export async function updateWorkspaceSettingsAction(
  input: UpdateWorkspaceSettingsInput,
): Promise<UpdateWorkspaceSettingsResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };

  const slugNorm = normalizeSlug(input.public_slug);
  const domainNorm = normalizeDomain(input.custom_domain);
  const slugErr = validatePublicSlug(slugNorm);
  if (slugErr) return { error: slugErr };

  const tz = input.calendar_timezone?.trim() || 'UTC';

  const shouldMergeMetadata =
    input.lead_alert_phone !== undefined ||
    input.lead_inactivity_timeout !== undefined ||
    input.member_inactivity_timeout !== undefined;

  let mergedMetadata: Json | undefined;
  if (shouldMergeMetadata) {
    if (input.lead_inactivity_timeout !== undefined) {
      const n = input.lead_inactivity_timeout;
      if (!Number.isInteger(n) || !LEAD_INACTIVITY_TIMEOUT_MINUTES.has(n)) {
        return { error: 'Invalid lead inactivity timeout.' };
      }
    }
    if (input.member_inactivity_timeout !== undefined) {
      const n = input.member_inactivity_timeout;
      if (!Number.isInteger(n) || !MEMBER_INACTIVITY_TIMEOUT_MINUTES.has(n)) {
        return { error: 'Invalid member inactivity timeout.' };
      }
    }

    const { data: metaRow, error: metaErr } = await supabase
      .from('workspaces')
      .select('metadata')
      .eq('id', input.workspaceId)
      .maybeSingle();

    if (metaErr) {
      if (isMissingColumnSchemaCacheError(metaErr, 'metadata')) {
        return {
          error:
            'Workspace metadata is not available on this database yet. Apply the workspace_metadata migration in Supabase, then try again.',
        };
      }
      return { error: formatUserFacingError(metaErr) };
    }

    const rawPhone = input.lead_alert_phone;
    const phoneNorm =
      rawPhone === undefined
        ? undefined
        : rawPhone === null || String(rawPhone).trim() === ''
          ? null
          : String(rawPhone).trim();

    mergedMetadata = mergeLeadAlertsMetadata(metaRow?.metadata ?? {}, {
      ...(input.lead_alert_phone !== undefined ? { leadPhone: phoneNorm } : {}),
      ...(input.lead_inactivity_timeout !== undefined
        ? { leadInactivityTimeout: input.lead_inactivity_timeout }
        : {}),
      ...(input.member_inactivity_timeout !== undefined
        ? { memberInactivityTimeout: input.member_inactivity_timeout }
        : {}),
    });
  }

  const { data, error } = await supabase
    .from('workspaces')
    .update({
      calendar_timezone: tz,
      is_public: input.is_public,
      public_slug: slugNorm,
      custom_domain: domainNorm,
      ...(mergedMetadata !== undefined ? { metadata: mergedMetadata } : {}),
    })
    .eq('id', input.workspaceId)
    .select('id');

  if (error) {
    if (isMissingColumnSchemaCacheError(error, 'calendar_timezone')) {
      return {
        error:
          'Calendar timezone is not available on this database yet. Apply the scheduled-dates migration in Supabase, then try again.',
      };
    }
    if (
      isMissingColumnSchemaCacheError(error, 'is_public') ||
      isMissingColumnSchemaCacheError(error, 'public_slug') ||
      isMissingColumnSchemaCacheError(error, 'custom_domain')
    ) {
      return {
        error:
          'Public portal fields are not available on this database yet. Apply the public-portals migration in Supabase, then try again.',
      };
    }
    if (isMissingColumnSchemaCacheError(error, 'metadata')) {
      return {
        error:
          'Workspace metadata is not available on this database yet. Apply the workspace_metadata migration in Supabase, then try again.',
      };
    }
    const code =
      typeof (error as { code?: unknown }).code === 'string'
        ? (error as { code: string }).code
        : '';
    if (code === '23505') {
      return {
        error:
          'That public URL slug or custom domain is already in use by another community. Try a different value.',
      };
    }
    return { error: formatUserFacingError(error) };
  }

  if (!data || data.length === 0) {
    return {
      error:
        'Could not save settings. Only owners and admins can update socialspace settings — if you need a change, ask a host.',
    };
  }

  return { ok: true };
}
