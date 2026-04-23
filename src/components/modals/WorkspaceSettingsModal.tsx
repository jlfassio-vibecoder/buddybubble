'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { CreditCard, X } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@utils/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { formatUserFacingError } from '@/lib/format-error';
import { COMMON_CALENDAR_TIMEZONES } from '@/lib/calendar-timezones';
import { shouldSubscribeWithoutTrial } from '@/lib/subscription-permissions';
import { useSubscriptionStore } from '@/store/subscriptionStore';
import { updateWorkspaceSettingsAction } from '@/app/(dashboard)/workspace-settings-actions';
import { TrialMemberAccessSection } from '@/components/modals/workspace-settings/TrialMemberAccessSection';

export { COMMON_CALENDAR_TIMEZONES };

const LEAD_INACTIVITY_OPTIONS: { value: number; label: string }[] = [
  { value: 2, label: '2 minutes' },
  { value: 5, label: '5 minutes' },
  { value: 10, label: '10 minutes' },
  { value: 30, label: '30 minutes' },
];

const MEMBER_INACTIVITY_OPTIONS: { value: number; label: string }[] = [
  { value: 15, label: '15 minutes' },
  { value: 30, label: '30 minutes' },
  { value: 60, label: '1 hour' },
  { value: 720, label: '12 hours' },
  { value: 1440, label: '24 hours' },
];

const LEAD_INACTIVITY_ALLOWED = new Set(LEAD_INACTIVITY_OPTIONS.map((o) => o.value));
const MEMBER_INACTIVITY_ALLOWED = new Set(MEMBER_INACTIVITY_OPTIONS.map((o) => o.value));

function readLeadInactivityTimeoutMinutes(metadata: unknown): number {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return 5;
  const raw = (metadata as Record<string, unknown>).lead_inactivity_timeout;
  const n = Number(raw);
  if (Number.isInteger(n) && LEAD_INACTIVITY_ALLOWED.has(n)) {
    return n;
  }
  return 5;
}

function readMemberInactivityTimeoutMinutes(metadata: unknown): number {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return 15;
  const raw = (metadata as Record<string, unknown>).member_inactivity_timeout;
  const n = Number(raw);
  if (Number.isInteger(n) && MEMBER_INACTIVITY_ALLOWED.has(n)) {
    return n;
  }
  return 15;
}

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
  const trialAvailable = useSubscriptionStore((s) => s.trialAvailable);
  const subscribeCta = shouldSubscribeWithoutTrial(trialAvailable, subscriptionStatus);
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
  const [leadAlertPhone, setLeadAlertPhone] = useState('');
  const [initialLeadAlertPhone, setInitialLeadAlertPhone] = useState('');
  const [leadInactivityTimeout, setLeadInactivityTimeout] = useState(5);
  const [initialLeadInactivityTimeout, setInitialLeadInactivityTimeout] = useState(5);
  const [memberInactivityTimeout, setMemberInactivityTimeout] = useState(15);
  const [initialMemberInactivityTimeout, setInitialMemberInactivityTimeout] = useState(15);
  const [configuringDomain, setConfiguringDomain] = useState(false);
  const [domainSyncToast, setDomainSyncToast] = useState<string | null>(null);

  const canConfigureLeadAlerts = isOwner || isAdmin;

  useEffect(() => {
    if (!domainSyncToast) return;
    const t = setTimeout(() => setDomainSyncToast(null), 4000);
    return () => clearTimeout(t);
  }, [domainSyncToast]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { data, error: qErr } = await supabase
      .from('workspaces')
      .select(
        isOwner || isAdmin
          ? 'calendar_timezone, is_public, public_slug, custom_domain, metadata'
          : 'calendar_timezone, is_public, public_slug, custom_domain',
      )
      .eq('id', workspaceId)
      .maybeSingle();
    setLoading(false);
    if (qErr || !data) {
      setError(qErr?.message ?? 'Could not load socialspace');
      return;
    }
    const row = data as {
      calendar_timezone?: string | null;
      is_public?: boolean | null;
      public_slug?: string | null;
      custom_domain?: string | null;
      metadata?: unknown;
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

    if (isOwner || isAdmin) {
      const meta = row.metadata;
      let phone = '';
      if (meta && typeof meta === 'object' && !Array.isArray(meta)) {
        const v = (meta as Record<string, unknown>).lead_alert_phone;
        if (typeof v === 'string') phone = v;
      }
      setLeadAlertPhone(phone);
      setInitialLeadAlertPhone(phone);
      const leadT = readLeadInactivityTimeoutMinutes(meta);
      const memberT = readMemberInactivityTimeoutMinutes(meta);
      setLeadInactivityTimeout(leadT);
      setInitialLeadInactivityTimeout(leadT);
      setMemberInactivityTimeout(memberT);
      setInitialMemberInactivityTimeout(memberT);
    } else {
      setLeadAlertPhone('');
      setInitialLeadAlertPhone('');
      setLeadInactivityTimeout(5);
      setInitialLeadInactivityTimeout(5);
      setMemberInactivityTimeout(15);
      setInitialMemberInactivityTimeout(15);
    }
  }, [workspaceId, isOwner, isAdmin]);

  useEffect(() => {
    if (!open) return;
    void load();
  }, [open, load]);

  const dirty =
    timezone !== initialTz ||
    isPublic !== initialIsPublic ||
    publicSlug.trim() !== initialPublicSlug.trim() ||
    customDomain.trim() !== initialCustomDomain.trim() ||
    (canConfigureLeadAlerts &&
      (leadAlertPhone.trim() !== initialLeadAlertPhone.trim() ||
        leadInactivityTimeout !== initialLeadInactivityTimeout ||
        memberInactivityTimeout !== initialMemberInactivityTimeout));

  const save = async () => {
    const oldDomain = initialCustomDomain.trim().toLowerCase() || null;
    const newDomain = customDomain.trim().toLowerCase() || null;
    const domainChanged = oldDomain !== newDomain;

    setSaving(true);
    setError(null);
    setDomainSyncToast(null);
    const slugNorm = publicSlug.trim().toLowerCase() || null;
    const domainNorm = customDomain.trim().toLowerCase() || null;
    const formData = {
      workspaceId,
      calendar_timezone: timezone,
      is_public: isPublic,
      public_slug: slugNorm,
      custom_domain: domainNorm,
      ...(canConfigureLeadAlerts
        ? {
            lead_alert_phone: leadAlertPhone.trim().length > 0 ? leadAlertPhone.trim() : null,
            lead_inactivity_timeout: leadInactivityTimeout,
            member_inactivity_timeout: memberInactivityTimeout,
          }
        : {}),
    };

    const saveResult = await updateWorkspaceSettingsAction(formData);
    setSaving(false);
    if ('error' in saveResult) {
      setError(saveResult.error);
      toast.error(saveResult.error);
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
            const msg = `Could not remove the previous domain from Vercel: ${await parseDomainApiMessage(del)}`;
            setError(msg);
            toast.error(msg);
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
            const msg = `Could not register the domain with Vercel: ${await parseDomainApiMessage(post)}`;
            setError(msg);
            toast.error(msg);
            return;
          }
        }
        vercelSynced = true;
      } catch (e) {
        const msg = formatUserFacingError(e);
        setError(msg);
        toast.error(msg);
        return;
      } finally {
        setConfiguringDomain(false);
      }
    }

    setInitialTz(timezone);
    setInitialIsPublic(isPublic);
    setInitialPublicSlug(slugNorm ?? '');
    setInitialCustomDomain(domainNorm ?? '');
    setPublicSlug(slugNorm ?? '');
    setCustomDomain(domainNorm ?? '');
    if (canConfigureLeadAlerts) {
      const savedPhone = leadAlertPhone.trim();
      setInitialLeadAlertPhone(savedPhone);
      setLeadAlertPhone(savedPhone);
      setInitialLeadInactivityTimeout(leadInactivityTimeout);
      setInitialMemberInactivityTimeout(memberInactivityTimeout);
    }
    onSaved?.();
    toast.success('Socialspace settings saved.');
    if (vercelSynced) {
      setDomainSyncToast('Custom domain synced with Vercel.');
    }
    onOpenChange(false);
  };

  return (
    <>
      {domainSyncToast ? (
        <div
          className="fixed bottom-4 left-1/2 z-[60] max-w-md -translate-x-1/2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-900 shadow-lg dark:text-emerald-100"
          role="status"
          aria-live="polite"
        >
          {domainSyncToast}
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
          <div className="relative z-10 flex max-h-[calc(100vh-2rem)] min-h-0 w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-2xl">
            <div className="flex shrink-0 items-start justify-between gap-2 border-b border-border bg-card px-6 pb-3 pt-6">
              <div className="min-w-0 pr-2">
                <h2 className="text-lg font-bold text-foreground">Socialspace settings</h2>
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
                className="shrink-0 rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {loading ? (
              <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-6 py-4">
                <p className="text-sm text-muted-foreground">Loading…</p>
              </div>
            ) : (
              <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-6 py-4">
                <div className="space-y-4">
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
                      compare to &ldquo;today&rdquo; for this socialspace.
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

                  {canConfigureLeadAlerts ? (
                    <>
                      <Separator />
                      <div className="space-y-4">
                        <div>
                          <h3 className="text-sm font-semibold text-foreground">Lead Alerts</h3>
                          <p className="text-xs text-muted-foreground">
                            Receive a text message when a new lead messages you in their trial
                            bubble.
                          </p>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="ws-lead-alert-phone">Alert phone number</Label>
                          <Input
                            id="ws-lead-alert-phone"
                            type="tel"
                            autoComplete="tel"
                            value={leadAlertPhone}
                            onChange={(e) => setLeadAlertPhone(e.target.value)}
                            placeholder="+1 555 123 4567"
                            className="h-9"
                          />
                          <p className="text-xs text-muted-foreground">
                            Saved on this BuddyBubble only. Leave blank to turn off SMS alerts.
                          </p>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="ws-lead-inactivity-timeout">
                            Lead Timeout (Trial Bubbles)
                          </Label>
                          <select
                            id="ws-lead-inactivity-timeout"
                            value={leadInactivityTimeout}
                            onChange={(e) => setLeadInactivityTimeout(Number(e.target.value))}
                            className="w-full rounded-md border border-input bg-background px-2 py-2 text-sm"
                          >
                            {LEAD_INACTIVITY_OPTIONS.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                          <p className="text-xs text-muted-foreground">
                            How long a trial chat must be quiet before a new message triggers a
                            text.
                          </p>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="ws-member-inactivity-timeout">
                            Member Timeout (Standard Bubbles)
                          </Label>
                          <select
                            id="ws-member-inactivity-timeout"
                            value={memberInactivityTimeout}
                            onChange={(e) => setMemberInactivityTimeout(Number(e.target.value))}
                            className="w-full rounded-md border border-input bg-background px-2 py-2 text-sm"
                          >
                            {MEMBER_INACTIVITY_OPTIONS.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                          <p className="text-xs text-muted-foreground">
                            How long a member chat must be quiet before a new message triggers a
                            text.
                          </p>
                        </div>
                      </div>
                    </>
                  ) : null}

                  {isOwner || isAdmin ? (
                    <>
                      <Separator />
                      <TrialMemberAccessSection
                        workspaceId={workspaceId}
                        canManage={isOwner || isAdmin}
                      />
                    </>
                  ) : null}

                  {isOwner &&
                    subscriptionStatus !== null &&
                    subscriptionStatus !== 'not_required' && (
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
                              href={`/api/stripe/portal?workspaceId=${encodeURIComponent(workspaceId)}`}
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
                              {subscribeCta ? 'Subscribe' : 'Start free trial'}
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
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
