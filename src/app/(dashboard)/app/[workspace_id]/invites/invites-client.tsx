'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { InviteQrDisplay } from './invite-qr-display';
import { PendingJoinRequestsSection } from './pending-join-requests-section';
import { MembersSection } from './members-section';
import {
  createEmailInviteAction,
  createInviteAction,
  createSmsInviteAction,
  revokeInviteAction,
} from './actions';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatUserFacingError } from '@/lib/format-error';
import type { WaitingRoomRow } from '@/lib/waiting-room-rows';
import type { MemberRole } from '@/types/database';

export type InviteListItem = {
  id: string;
  token: string;
  invite_type: string;
  label: string | null;
  max_uses: number;
  uses_count: number;
  expires_at: string;
  revoked_at: string | null;
  target_identity: string | null;
  inviteUrl: string;
  created_at: string;
};

const EXPIRY_OPTIONS = [
  { label: '1 hour', hours: 1 },
  { label: '24 hours', hours: 24 },
  { label: '7 days', hours: 24 * 7 },
] as const;

/**
 * Invitable roles exclude `owner` (promotion-only via owner action) and
 * `trialing` (issued only by the Storefront Lead intake API, not via invites).
 */
const INVITE_ROLE_OPTIONS: Array<{
  value: Exclude<MemberRole, 'owner' | 'trialing'>;
  label: string;
  desc: string;
}> = [
  { value: 'admin', label: 'Admin', desc: 'Manage socialspace, members & bubbles' },
  { value: 'member', label: 'Member', desc: 'Write access to all public bubbles' },
  { value: 'guest', label: 'Guest', desc: 'Explicit-access only (assigned bubbles/cards)' },
];

type Props = {
  workspaceId: string;
  workspaceName: string;
  initialInvites: InviteListItem[];
  initialWaitingRows: WaitingRoomRow[];
  currentUserId: string;
  callerRole: 'owner' | 'admin';
  /** Show family names in member profile modal (Kids / Community workspaces). */
  showFamilyNames?: boolean;
  /** Render inside a dialog / sheet — no full-screen fixed layer; tab changes do not touch the route. */
  embedded?: boolean;
  /** When `embedded`, initial tab (URL `tab` is ignored). */
  initialSegment?: 'pending' | 'invites' | 'members';
  /** When `embedded`, header action to dismiss the shell. */
  onRequestClose?: () => void;
};

export function InvitesClient({
  workspaceId,
  workspaceName,
  initialInvites,
  initialWaitingRows,
  currentUserId,
  callerRole,
  showFamilyNames = false,
  embedded = false,
  initialSegment,
  onRequestClose,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');

  const [invites, setInvites] = useState(initialInvites);
  const [waitingRows, setWaitingRows] = useState(initialWaitingRows);
  const [segment, setSegment] = useState<'pending' | 'invites' | 'members'>(() => {
    if (embedded) {
      if (initialSegment) return initialSegment;
      return 'invites';
    }
    if (initialSegment) return initialSegment;
    return tabParam === 'pending' ? 'pending' : tabParam === 'members' ? 'members' : 'invites';
  });
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [linkLabel, setLinkLabel] = useState('');
  const [linkMaxUses, setLinkMaxUses] = useState('1');
  const [linkExpiryHours, setLinkExpiryHours] = useState(24);
  const [linkMode, setLinkMode] = useState<'link' | 'qr'>('link');
  const [linkRole, setLinkRole] = useState<Exclude<MemberRole, 'owner' | 'trialing'>>('member');
  const [lastCreatedUrl, setLastCreatedUrl] = useState<string | null>(null);
  const [lastCreatedMode, setLastCreatedMode] = useState<'link' | 'qr' | null>(null);

  const [emailAddr, setEmailAddr] = useState('');
  const [emailLabel, setEmailLabel] = useState('');
  const [emailMaxUses, setEmailMaxUses] = useState('1');
  const [emailExpiryHours, setEmailExpiryHours] = useState(24 * 7);
  const [emailRole, setEmailRole] = useState<Exclude<MemberRole, 'owner' | 'trialing'>>('member');

  const [smsPhone, setSmsPhone] = useState('');
  const [smsLabel, setSmsLabel] = useState('');
  const [smsMaxUses, setSmsMaxUses] = useState('1');
  const [smsExpiryHours, setSmsExpiryHours] = useState(24 * 7);
  const [smsRole, setSmsRole] = useState<Exclude<MemberRole, 'owner' | 'trialing'>>('member');

  useEffect(() => {
    setInvites(initialInvites);
  }, [initialInvites]);

  useEffect(() => {
    setWaitingRows(initialWaitingRows);
  }, [initialWaitingRows]);

  useEffect(() => {
    if (embedded) return;
    if (tabParam === 'pending') setSegment('pending');
    if (tabParam === 'invites') setSegment('invites');
    if (tabParam === 'members') setSegment('members');
  }, [tabParam, embedded]);

  useEffect(() => {
    if (segment === 'pending' && waitingRows.length === 0) {
      setSegment('invites');
    }
  }, [segment, waitingRows.length]);

  const pendingCount = waitingRows.length;
  const showPendingTab = pendingCount > 0;

  const goPending = () => {
    setSegment('pending');
    if (!embedded) {
      router.replace(`${pathname}?tab=pending`, { scroll: false });
    }
  };

  const goInvites = () => {
    setSegment('invites');
    if (!embedded) {
      router.replace(`${pathname}?tab=invites`, { scroll: false });
    }
  };

  const goMembers = () => {
    setSegment('members');
    if (!embedded) {
      router.replace(`${pathname}?tab=members`, { scroll: false });
    }
  };

  const now = Date.now();

  const submitLinkOrQr = () => {
    setError(null);
    setMessage(null);
    const maxUses = Math.max(1, parseInt(linkMaxUses, 10) || 1);
    startTransition(async () => {
      const r = await createInviteAction({
        workspaceId,
        inviteType: linkMode,
        maxUses,
        expiresInHours: linkExpiryHours,
        label: linkLabel,
        role: linkRole,
      });
      if ('error' in r && r.error) {
        setError(r.error);
        return;
      }
      if ('inviteUrl' in r && r.inviteUrl) {
        setLastCreatedUrl(r.inviteUrl);
        setLastCreatedMode(linkMode);
      }
      setMessage('Invite created.');
      router.refresh();
    });
  };

  const submitEmail = () => {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const r = await createEmailInviteAction({
        workspaceId,
        email: emailAddr,
        maxUses: Math.max(1, parseInt(emailMaxUses, 10) || 1),
        expiresInHours: emailExpiryHours,
        label: emailLabel,
        workspaceName,
        role: emailRole,
      });
      if ('error' in r && r.error) {
        setError(r.error);
        return;
      }
      setEmailAddr('');
      setMessage('Invite created and email sent.');
      router.refresh();
    });
  };

  const submitSms = () => {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const r = await createSmsInviteAction({
        workspaceId,
        phone: smsPhone,
        maxUses: Math.max(1, parseInt(smsMaxUses, 10) || 1),
        expiresInHours: smsExpiryHours,
        label: smsLabel,
        workspaceName,
        role: smsRole,
      });
      if ('error' in r && r.error) {
        setError(r.error);
        return;
      }
      setSmsPhone('');
      setMessage('Invite created and SMS sent.');
      router.refresh();
    });
  };

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setMessage('Copied to clipboard.');
      setError(null);
    } catch {
      setError('Could not copy.');
    }
  };

  const revoke = (id: string) => {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const r = await revokeInviteAction({ workspaceId, invitationId: id });
      if ('error' in r && r.error) {
        setError(r.error);
        return;
      }
      setMessage('Invite revoked.');
      router.refresh();
    });
  };

  const rootClass = embedded
    ? 'flex min-h-0 flex-1 flex-col overflow-hidden bg-background'
    : 'fixed inset-0 z-[100] flex flex-col overflow-hidden bg-background';

  return (
    <div className={rootClass}>
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-4 border-b border-border bg-card px-4 py-3 shadow-sm">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold text-foreground">People & invites</h1>
          <p className="text-xs text-muted-foreground">
            Approve join requests, then create links, QR codes, and email or SMS invites for{' '}
            {workspaceName}.
          </p>
        </div>
        {embedded ? (
          <Button type="button" variant="outline" size="sm" onClick={onRequestClose}>
            Close
          </Button>
        ) : (
          <Link
            href={`/app/${workspaceId}`}
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
          >
            Back to socialspace
          </Link>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        <div className="mx-auto max-w-3xl space-y-8 pb-12">
          {/* Tab bar — always visible */}
          <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-muted/30 p-1">
            <button
              type="button"
              onClick={goMembers}
              className={cn(
                'rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
                segment === 'members'
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              Members & access
            </button>
            {showPendingTab ? (
              <button
                type="button"
                onClick={goPending}
                className={cn(
                  'rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
                  segment === 'pending'
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                Pending approvals ({pendingCount})
              </button>
            ) : null}
            <button
              type="button"
              onClick={goInvites}
              className={cn(
                'rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
                segment === 'invites'
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              Create invites
            </button>
          </div>

          {segment === 'members' ? (
            <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
              <h2 className="text-base font-semibold">Members & access</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Manage socialspace roles and per-bubble access for everyone in {workspaceName}.
              </p>
              <div className="mt-4">
                <MembersSection
                  workspaceId={workspaceId}
                  currentUserId={currentUserId}
                  callerRole={callerRole}
                  showFamilyNames={showFamilyNames}
                />
              </div>
            </section>
          ) : null}

          {showPendingTab && segment === 'pending' ? (
            <PendingJoinRequestsSection workspaceId={workspaceId} rows={waitingRows} />
          ) : null}

          {message ? (
            <p className="rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-200">
              {message}
            </p>
          ) : null}
          {error ? (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {formatUserFacingError(error)}
            </p>
          ) : null}

          {(!showPendingTab || segment === 'invites') && (
            <>
              <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
                <h2 className="text-base font-semibold">Private link or QR</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  <strong className="text-foreground">Max uses = 1</strong>: instant join when
                  someone opens the link.{' '}
                  <strong className="text-foreground">Max uses greater than 1</strong>: each new
                  person waits for an admin to approve on the{' '}
                  <button
                    type="button"
                    className="font-medium text-primary underline underline-offset-2 hover:text-primary/80"
                    onClick={() => {
                      if (showPendingTab) goPending();
                      else router.push(`${pathname}?tab=pending`);
                    }}
                  >
                    Pending approvals
                  </button>{' '}
                  tab (up to your max uses).
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={linkMode === 'link' ? 'default' : 'outline'}
                    onClick={() => setLinkMode('link')}
                  >
                    Link
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={linkMode === 'qr' ? 'default' : 'outline'}
                    onClick={() => setLinkMode('qr')}
                  >
                    QR code
                  </Button>
                </div>
                {linkMode === 'qr' ? (
                  <p className="mt-3 text-xs text-muted-foreground">
                    QR is best in person: your guest can tap{' '}
                    <strong className="text-foreground">Join instantly as a guest</strong> on the
                    invite page — no email round-trip. They can still use Google or email if they
                    prefer.
                  </p>
                ) : null}
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-medium">Label (optional)</label>
                    <input
                      value={linkLabel}
                      onChange={(e) => setLinkLabel(e.target.value)}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      placeholder="e.g. Team night"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium">Max uses</label>
                    <input
                      type="number"
                      min={1}
                      value={linkMaxUses}
                      onChange={(e) => setLinkMaxUses(e.target.value)}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium">Invite as</label>
                    <select
                      value={linkRole}
                      onChange={(e) =>
                        setLinkRole(e.target.value as Exclude<MemberRole, 'owner' | 'trialing'>)
                      }
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      {INVITE_ROLE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value} title={o.desc}>
                          {o.label} — {o.desc}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium">Expires after</label>
                    <select
                      value={linkExpiryHours}
                      onChange={(e) => setLinkExpiryHours(Number(e.target.value))}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      {EXPIRY_OPTIONS.map((o) => (
                        <option key={o.hours} value={o.hours}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <Button
                  type="button"
                  className="mt-4"
                  disabled={pending}
                  onClick={() => void submitLinkOrQr()}
                >
                  {pending ? 'Creating…' : linkMode === 'qr' ? 'Generate QR invite' : 'Create link'}
                </Button>
                {lastCreatedUrl && lastCreatedMode ? (
                  <div className="mt-6 space-y-3 border-t border-border pt-6">
                    <p className="text-sm font-medium">New invite</p>
                    {lastCreatedMode === 'qr' ? <InviteQrDisplay url={lastCreatedUrl} /> : null}
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => void copyText(lastCreatedUrl)}
                      >
                        Copy link
                      </Button>
                    </div>
                    <p className="break-all text-xs text-muted-foreground">{lastCreatedUrl}</p>
                  </div>
                ) : null}
              </section>

              <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
                <h2 className="text-base font-semibold">Email invite</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Creates an invite locked to that address and sends the link via Resend (requires
                  env keys).
                </p>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-sm font-medium">Email</label>
                    <input
                      type="email"
                      value={emailAddr}
                      onChange={(e) => setEmailAddr(e.target.value)}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      required
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium">Label (optional)</label>
                    <input
                      value={emailLabel}
                      onChange={(e) => setEmailLabel(e.target.value)}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium">Max uses</label>
                    <input
                      type="number"
                      min={1}
                      value={emailMaxUses}
                      onChange={(e) => setEmailMaxUses(e.target.value)}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium">Invite as</label>
                    <select
                      value={emailRole}
                      onChange={(e) =>
                        setEmailRole(e.target.value as Exclude<MemberRole, 'owner' | 'trialing'>)
                      }
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      {INVITE_ROLE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label} — {o.desc}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium">Expires after</label>
                    <select
                      value={emailExpiryHours}
                      onChange={(e) => setEmailExpiryHours(Number(e.target.value))}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      {EXPIRY_OPTIONS.map((o) => (
                        <option key={o.hours} value={o.hours}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <Button
                  type="button"
                  className="mt-4"
                  disabled={pending}
                  onClick={() => void submitEmail()}
                >
                  {pending ? 'Sending…' : 'Create and email invite'}
                </Button>
              </section>

              <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
                <h2 className="text-base font-semibold">SMS invite</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  E.164 phone (e.g. +15551234567). Sends via Twilio. The invitee must sign in with a
                  verified phone on their account that matches this number.
                </p>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-sm font-medium">Phone</label>
                    <input
                      type="tel"
                      value={smsPhone}
                      onChange={(e) => setSmsPhone(e.target.value)}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      placeholder="+15551234567"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium">Label (optional)</label>
                    <input
                      value={smsLabel}
                      onChange={(e) => setSmsLabel(e.target.value)}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium">Max uses</label>
                    <input
                      type="number"
                      min={1}
                      value={smsMaxUses}
                      onChange={(e) => setSmsMaxUses(e.target.value)}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium">Invite as</label>
                    <select
                      value={smsRole}
                      onChange={(e) =>
                        setSmsRole(e.target.value as Exclude<MemberRole, 'owner' | 'trialing'>)
                      }
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      {INVITE_ROLE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label} — {o.desc}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium">Expires after</label>
                    <select
                      value={smsExpiryHours}
                      onChange={(e) => setSmsExpiryHours(Number(e.target.value))}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      {EXPIRY_OPTIONS.map((o) => (
                        <option key={o.hours} value={o.hours}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <Button
                  type="button"
                  className="mt-4"
                  disabled={pending}
                  onClick={() => void submitSms()}
                >
                  {pending ? 'Sending…' : 'Create and SMS invite'}
                </Button>
              </section>

              <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
                <h2 className="text-base font-semibold">Active invites</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Non-revoked invites for this socialspace.
                </p>
                {invites.length === 0 ? (
                  <p className="mt-4 text-sm text-muted-foreground">None yet.</p>
                ) : (
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full min-w-[720px] text-left text-sm">
                      <thead className="border-b border-border text-muted-foreground">
                        <tr>
                          <th className="py-2 pr-2">Type</th>
                          <th className="py-2 pr-2">Label</th>
                          <th className="py-2 pr-2">Target</th>
                          <th className="py-2 pr-2">Uses</th>
                          <th className="py-2 pr-2">Expires</th>
                          <th className="py-2 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {invites.map((inv) => {
                          const expired = new Date(inv.expires_at).getTime() < now;
                          const flow = inv.max_uses > 1 ? 'Approval' : 'Instant';
                          return (
                            <tr key={inv.id} className="border-b border-border last:border-0">
                              <td className="py-2 pr-2 align-top">
                                {inv.invite_type}
                                <div className="text-xs text-muted-foreground">{flow}</div>
                              </td>
                              <td className="max-w-[120px] truncate py-2 pr-2 align-top">
                                {inv.label ?? '—'}
                              </td>
                              <td className="max-w-[140px] truncate py-2 pr-2 align-top text-muted-foreground">
                                {inv.target_identity ?? '—'}
                              </td>
                              <td className="py-2 pr-2 align-top">
                                {inv.uses_count}/{inv.max_uses}
                              </td>
                              <td className="py-2 pr-2 align-top">
                                {new Date(inv.expires_at).toLocaleString()}
                                {expired ? (
                                  <span className="ml-1 text-xs text-amber-700 dark:text-amber-300">
                                    expired
                                  </span>
                                ) : null}
                              </td>
                              <td className="py-2 text-right align-top">
                                <div className="flex justify-end gap-2">
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() => void copyText(inv.inviteUrl)}
                                  >
                                    Copy
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="destructive"
                                    disabled={pending}
                                    onClick={() => void revoke(inv.id)}
                                  >
                                    Revoke
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
