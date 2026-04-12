'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { CreditCard, X } from 'lucide-react';
import { createClient } from '@utils/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { formatUserFacingError } from '@/lib/format-error';
import { isMissingColumnSchemaCacheError } from '@/lib/supabase-schema-errors';
import { COMMON_CALENDAR_TIMEZONES } from '@/lib/calendar-timezones';
import { useSubscriptionStore } from '@/store/subscriptionStore';

export { COMMON_CALENDAR_TIMEZONES };

export type WorkspaceSettingsModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  onSaved?: () => void;
  /** When true, show link to pending join requests (waiting room). */
  isAdmin?: boolean;
  /** When true, show subscription / billing section. */
  isOwner?: boolean;
};

export function WorkspaceSettingsModal({
  open,
  onOpenChange,
  workspaceId,
  onSaved,
  isAdmin = false,
  isOwner = false,
}: WorkspaceSettingsModalProps) {
  const subscriptionStatus = useSubscriptionStore((s) => s.status);
  const openTrialModal = useSubscriptionStore((s) => s.openTrialModal);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timezone, setTimezone] = useState('UTC');
  const [initialTz, setInitialTz] = useState('UTC');
  const [isPublic, setIsPublic] = useState(false);
  const [initialIsPublic, setInitialIsPublic] = useState(false);
  const [publicSlug, setPublicSlug] = useState('');
  const [initialPublicSlug, setInitialPublicSlug] = useState('');
  const [customDomain, setCustomDomain] = useState('');
  const [initialCustomDomain, setInitialCustomDomain] = useState('');
  const [configuringDomain, setConfiguringDomain] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { data, error: qErr } = await supabase
      .from('workspaces')
      .select('*')
      .eq('id', workspaceId)
      .maybeSingle();
    setLoading(false);
    if (qErr || !data) {
      setError(qErr?.message ?? 'Could not load workspace');
      return;
    }
    const row = data as {
      calendar_timezone?: string | null;
      is_public?: boolean | null;
      public_slug?: string | null;
      custom_domain?: string | null;
    };
    const tz = row.calendar_timezone?.trim() || 'UTC';
    setTimezone(tz);
    setInitialTz(tz);
    const pub = !!row.is_public;
    setIsPublic(pub);
    setInitialIsPublic(pub);
    const slug = row.public_slug?.trim() ?? '';
    setPublicSlug(slug);
    setInitialPublicSlug(slug);
    const domain = row.custom_domain?.trim() ?? '';
    setCustomDomain(domain);
    setInitialCustomDomain(domain);
  }, [workspaceId]);

  useEffect(() => {
    if (!open) return;
    void load();
  }, [open, load]);

  const dirty =
    timezone !== initialTz ||
    isPublic !== initialIsPublic ||
    publicSlug.trim() !== initialPublicSlug.trim() ||
    customDomain.trim() !== initialCustomDomain.trim();

  const save = async () => {
    const oldDomain = initialCustomDomain.trim() || null;
    const newDomain = customDomain.trim() || null;
    const domainChanged = oldDomain !== newDomain;

    setSaving(true);
    setError(null);
    setToast(null);
    const supabase = createClient();
    const slugNorm = publicSlug.trim() || null;
    const domainNorm = customDomain.trim() || null;
    const { error: uErr } = await supabase
      .from('workspaces')
      .update({
        calendar_timezone: timezone,
        is_public: isPublic,
        public_slug: slugNorm,
        custom_domain: domainNorm,
      })
      .eq('id', workspaceId);
    setSaving(false);
    if (uErr) {
      if (isMissingColumnSchemaCacheError(uErr, 'calendar_timezone')) {
        setError(
          'Calendar timezone is not available on this database yet. Apply the scheduled-dates migration in Supabase, then try again.',
        );
      } else if (
        isMissingColumnSchemaCacheError(uErr, 'is_public') ||
        isMissingColumnSchemaCacheError(uErr, 'public_slug') ||
        isMissingColumnSchemaCacheError(uErr, 'custom_domain')
      ) {
        setError(
          'Public portal fields are not available on this database yet. Apply the public-portals migration in Supabase, then try again.',
        );
      } else {
        setError(formatUserFacingError(uErr));
      }
      return;
    }

    let vercelSynced = false;
    if (isAdmin && domainChanged) {
      setConfiguringDomain(true);
      try {
        const parseDomainApiMessage = async (res: Response) => {
          try {
            const j = (await res.json()) as {
              error?: string;
              details?: { error?: { message?: string } };
            };
            if (typeof j?.error === 'string') return j.error;
            const m = j?.details?.error?.message;
            if (typeof m === 'string') return m;
          } catch {
            // ignore
          }
          return res.statusText || 'Request failed';
        };

        if (oldDomain && oldDomain !== newDomain) {
          const del = await fetch('/api/domains', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ workspace_id: workspaceId, domain: oldDomain }),
          });
          if (!del.ok) {
            setError(
              `Could not remove the previous domain from Vercel: ${await parseDomainApiMessage(del)}`,
            );
            return;
          }
        }
        if (newDomain && newDomain !== oldDomain) {
          const post = await fetch('/api/domains', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ workspace_id: workspaceId, domain: newDomain }),
          });
          if (!post.ok) {
            setError(
              `Could not register the domain with Vercel: ${await parseDomainApiMessage(post)}`,
            );
            return;
          }
        }
        vercelSynced = true;
      } catch (e) {
        setError(formatUserFacingError(e));
        return;
      } finally {
        setConfiguringDomain(false);
      }
    }

    setInitialTz(timezone);
    setInitialIsPublic(isPublic);
    setInitialPublicSlug(publicSlug.trim());
    setInitialCustomDomain(customDomain.trim());
    onSaved?.();
    if (vercelSynced) {
      setToast('Custom domain synced with Vercel.');
    }
    onOpenChange(false);
  };

  return (
    <>
      {toast ? (
        <div
          className="fixed bottom-4 left-1/2 z-[60] max-w-md -translate-x-1/2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-900 shadow-lg dark:text-emerald-100"
          role="status"
          aria-live="polite"
        >
          {toast}
        </div>
      ) : null}
      {!open ? null : (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Close"
            onClick={() => onOpenChange(false)}
          />
          <div className="relative z-10 w-full max-w-lg rounded-2xl border border-border bg-card p-6 text-card-foreground shadow-2xl">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="text-lg font-bold text-foreground">Workspace settings</h2>
                <p className="text-xs text-muted-foreground">
                  Calendar timezone for cards and automation.
                </p>
                {isAdmin ? (
                  <p className="mt-2 text-xs">
                    <Link
                      href={`/app/${workspaceId}/invites?tab=pending`}
                      className="font-medium text-primary underline underline-offset-4 hover:text-primary/80"
                      onClick={() => onOpenChange(false)}
                    >
                      Pending join requests
                    </Link>
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {loading ? (
              <p className="mt-4 text-sm text-muted-foreground">Loading…</p>
            ) : (
              <div className="mt-4 space-y-4">
                {error ? (
                  <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {error}
                  </div>
                ) : null}
                <div className="space-y-2">
                  <Label htmlFor="ws-cal-tz">Calendar timezone</Label>
                  <select
                    id="ws-cal-tz"
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-2 py-2 text-sm"
                  >
                    {!COMMON_CALENDAR_TIMEZONES.includes(
                      timezone as (typeof COMMON_CALENDAR_TIMEZONES)[number],
                    ) && <option value={timezone}>{timezone} (current)</option>}
                    {COMMON_CALENDAR_TIMEZONES.map((tz) => (
                      <option key={tz} value={tz}>
                        {tz}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground">
                    Changing this affects when cards move to the Today column and how due dates
                    compare to &ldquo;today&rdquo; for this workspace.
                  </p>
                </div>

                <Separator />

                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">Public Portal</h3>
                    <p className="text-xs text-muted-foreground">
                      Optional public storefront for this BuddyBubble (Astro).
                    </p>
                  </div>
                  <div className="flex items-start gap-2">
                    <input
                      id="ws-is-public"
                      type="checkbox"
                      checked={isPublic}
                      onChange={(e) => setIsPublic(e.target.checked)}
                      className="mt-1 size-4 rounded border-input"
                    />
                    <div>
                      <Label htmlFor="ws-is-public" className="cursor-pointer font-medium">
                        Publish storefront
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        When on, anonymous visitors can read published cards on your public portal
                        (per card visibility).
                      </p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ws-public-slug">Public URL slug</Label>
                    <div className="flex min-w-0 items-stretch rounded-md border border-input bg-background text-sm shadow-sm">
                      <span className="flex shrink-0 items-center border-r border-input bg-muted/50 px-2 text-muted-foreground">
                        buddybubble.app/
                      </span>
                      <Input
                        id="ws-public-slug"
                        value={publicSlug}
                        onChange={(e) => setPublicSlug(e.target.value)}
                        placeholder="your-community"
                        className="min-w-0 border-0 shadow-none focus-visible:ring-0"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ws-custom-domain">Custom domain</Label>
                    <Input
                      id="ws-custom-domain"
                      value={customDomain}
                      onChange={(e) => setCustomDomain(e.target.value)}
                      placeholder="mycommunity.com"
                      className="h-9"
                    />
                    <p className="text-xs text-muted-foreground">
                      Requires Vercel DNS configuration.
                    </p>
                  </div>
                </div>

                {isOwner && subscriptionStatus !== null && subscriptionStatus !== 'not_required' && (
                  <>
                    <Separator />
                    <div className="space-y-3">
                      <div>
                        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                          <CreditCard className="h-4 w-4 text-muted-foreground" aria-hidden />
                          Subscription
                        </h3>
                        <p className="text-xs text-muted-foreground">
                          {subscriptionStatus === 'trialing'
                            ? 'Your free trial is active.'
                            : subscriptionStatus === 'active'
                              ? 'Your subscription is active.'
                              : subscriptionStatus === 'past_due'
                                ? 'Payment failed — update your payment method.'
                                : subscriptionStatus === 'no_subscription'
                                  ? 'No active subscription.'
                                  : 'Your subscription has ended.'}
                        </p>
                      </div>
                      {['trialing', 'active', 'past_due'].includes(subscriptionStatus) ? (
                        <a
                          href={`/api/stripe/portal?workspaceId=${workspaceId}`}
                          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted"
                          onClick={() => onOpenChange(false)}
                        >
                          Manage billing
                        </a>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          variant="default"
                          onClick={() => {
                            onOpenChange(false);
                            openTrialModal();
                          }}
                        >
                          Start free trial
                        </Button>
                      )}
                    </div>
                  </>
                )}

                <Button
                  type="button"
                  size="sm"
                  disabled={saving || configuringDomain || !dirty}
                  onClick={() => void save()}
                >
                  {configuringDomain ? 'Updating domain…' : saving ? 'Saving…' : 'Save'}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
