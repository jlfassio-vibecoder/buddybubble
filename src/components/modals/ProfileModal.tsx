'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Check,
  X,
  Camera,
  Save,
  User,
  Mail,
  Globe,
  LogOut,
  Shield,
  Plus,
  Trash2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { createClient } from '@utils/supabase/client';
import { useUserProfileStore, type UserProfileRow } from '@/store/userProfileStore';
import {
  AVATARS_BUCKET,
  buildAvatarObjectPath,
  extractAvatarObjectPath,
} from '@/lib/avatar-storage';
import { formatUserFacingError } from '@/lib/format-error';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { CategoryThemeSelect } from '@/components/theme/category-theme-select';
import { isMissingColumnSchemaCacheError } from '@/lib/supabase-schema-errors';
import { COMMON_CALENDAR_TIMEZONES } from '@/lib/calendar-timezones';
import { resolvePermissions } from '@/lib/permissions';
import { ALL_BUBBLES_LABEL } from '@/lib/all-bubbles';
import type { MemberRole, BubbleMemberRole } from '@/types/database';
import { setPasswordAction } from '@/app/(dashboard)/profile-actions';

/** When set (e.g. from workspace dashboard), shows role and effective capabilities for the current channel. */
export type ProfilePermissionsContext = {
  workspaceName: string;
  workspaceRole: MemberRole;
  selectedBubbleLabel: string;
  bubbleMemberRole: BubbleMemberRole | null;
  selectedBubbleIsPrivate: boolean;
};

export type ProfileModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  permissionsContext?: ProfilePermissionsContext;
  /** Show the Family members section (Kids / Community workspace). */
  showFamilyNames?: boolean;
};

function workspaceRoleLabel(role: MemberRole): string {
  switch (role) {
    case 'owner':
      return 'Owner';
    case 'admin':
      return 'Admin';
    case 'member':
      return 'Member';
    case 'guest':
      return 'Guest';
    default:
      return role;
  }
}

function bubbleMemberLabel(role: BubbleMemberRole): string {
  return role === 'editor' ? 'Editor' : 'Viewer';
}

function PermissionRow({ label, enabled }: { label: string; enabled: boolean }) {
  return (
    <li className="flex items-start gap-2">
      {enabled ? (
        <Check
          className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-500"
          aria-hidden
        />
      ) : (
        <span
          className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border border-border text-[10px] font-bold text-muted-foreground"
          aria-hidden
        >
          —
        </span>
      )}
      <span className={enabled ? 'text-foreground' : 'text-muted-foreground'}>{label}</span>
    </li>
  );
}

export function ProfileModal({
  open,
  onOpenChange,
  permissionsContext,
  showFamilyNames = false,
}: ProfileModalProps) {
  const router = useRouter();
  const profile = useUserProfileStore((s) => s.profile);
  const setProfile = useUserProfileStore((s) => s.setProfile);
  const loadProfile = useUserProfileStore((s) => s.loadProfile);

  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [childrenNames, setChildrenNames] = useState<string[]>([]);
  const [newChildName, setNewChildName] = useState('');
  const [timezone, setTimezone] = useState('UTC');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [avatarPreview, setAvatarPreview] = useState('');
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setSigningOut(false);
    setPassword('');
    setConfirmPassword('');
    void loadProfile();
  }, [open, loadProfile]);

  useEffect(() => {
    if (!open) return;
    if (!profile) return;
    setName(profile.full_name?.trim() || '');
    setBio(profile.bio?.trim() ?? '');
    setChildrenNames(profile.children_names ?? []);
    setNewChildName('');
    setTimezone(profile.timezone?.trim() || 'UTC');
    setAvatarPreview(profile.avatar_url ?? '');
    setPendingFile(null);
  }, [open, profile]);

  const addChild = () => {
    const n = newChildName.trim();
    if (!n || n.length > 64 || childrenNames.length >= 8) return;
    setChildrenNames((prev) => [...prev, n]);
    setNewChildName('');
  };

  const removeChild = (idx: number) => {
    setChildrenNames((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingFile(file);
    setError(null);
    const reader = new FileReader();
    reader.onloadend = () => {
      setAvatarPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const pwTrimmed = password.trim();
    const confirmTrimmed = confirmPassword.trim();
    if (password.trim() !== '' && pwTrimmed.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password.trim() !== '' && pwTrimmed !== confirmTrimmed) {
      setError('Passwords do not match.');
      return;
    }
    setError(null);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError('Not signed in');
      return;
    }

    setSaving(true);
    try {
      let nextAvatarUrl: string | null = profile?.avatar_url ?? null;
      if (pendingFile) {
        const path = buildAvatarObjectPath(user.id, pendingFile);
        const { error: upErr } = await supabase.storage
          .from(AVATARS_BUCKET)
          .upload(path, pendingFile, {
            cacheControl: '3600',
            contentType: pendingFile.type || 'image/jpeg',
            upsert: false,
          });
        if (upErr) {
          setError(formatUserFacingError(upErr));
          setSaving(false);
          return;
        }
        const { data: pub } = supabase.storage.from(AVATARS_BUCKET).getPublicUrl(path);
        nextAvatarUrl = pub.publicUrl;
      }

      const baseUpdate = {
        full_name: name.trim(),
        avatar_url: nextAvatarUrl,
        bio: bio.trim() || null,
        children_names: childrenNames.map((n) => n.trim()).filter(Boolean),
      };
      let { data: updated, error: updErr } = await supabase
        .from('users')
        .update({
          ...baseUpdate,
          timezone: timezone.trim() || 'UTC',
        })
        .eq('id', user.id)
        .select('*')
        .single();

      if (updErr && isMissingColumnSchemaCacheError(updErr, 'timezone')) {
        const retry = await supabase
          .from('users')
          .update(baseUpdate)
          .eq('id', user.id)
          .select('*')
          .single();
        if (retry.error || !retry.data) {
          setError(formatUserFacingError(retry.error ?? new Error('Update failed')));
          setSaving(false);
          return;
        }
        setProfile(retry.data as UserProfileRow);
        if (pendingFile && profile?.avatar_url && nextAvatarUrl) {
          const oldPath = extractAvatarObjectPath(profile.avatar_url);
          const newPath = extractAvatarObjectPath(nextAvatarUrl);
          if (oldPath && newPath && oldPath !== newPath) {
            void supabase.storage.from(AVATARS_BUCKET).remove([oldPath]);
          }
        }
        setError(
          'Timezone is not saved yet: apply the users timezone migration on Supabase (users.timezone), then try again.',
        );
        setSaving(false);
        return;
      }

      if (updErr || !updated) {
        setError(formatUserFacingError(updErr ?? new Error('Update failed')));
        setSaving(false);
        return;
      }

      setProfile(updated as UserProfileRow);
      if (pendingFile && profile?.avatar_url && nextAvatarUrl) {
        const oldPath = extractAvatarObjectPath(profile.avatar_url);
        const newPath = extractAvatarObjectPath(nextAvatarUrl);
        if (oldPath && newPath && oldPath !== newPath) {
          void supabase.storage.from(AVATARS_BUCKET).remove([oldPath]);
        }
      }

      if (pwTrimmed) {
        const pwResult = await setPasswordAction(pwTrimmed);
        if ('error' in pwResult) {
          setError(
            `Your profile was saved, but your password could not be updated: ${pwResult.error}`,
          );
          setSaving(false);
          return;
        }
      }

      setSaving(false);
      onOpenChange(false);
    } catch (err) {
      setError(formatUserFacingError(err));
      setSaving(false);
    }
  };

  async function handleSignOut() {
    setError(null);
    setSigningOut(true);
    try {
      const supabase = createClient();
      const { error: outErr } = await supabase.auth.signOut();
      if (outErr) {
        setError(formatUserFacingError(outErr));
        setSigningOut(false);
        return;
      }
      setProfile(null);
      onOpenChange(false);
      router.push('/login');
      router.refresh();
    } catch (err) {
      setError(formatUserFacingError(err));
      setSigningOut(false);
    }
  }

  const displayName = name || 'Member';

  const permissionFlags = permissionsContext
    ? resolvePermissions(
        permissionsContext.workspaceRole,
        permissionsContext.bubbleMemberRole,
        permissionsContext.selectedBubbleIsPrivate,
      )
    : null;

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => onOpenChange(false)}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative flex w-full max-w-md flex-col overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-2xl"
            onClick={(ev) => ev.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-border p-6">
              <h3 className="text-xl font-bold text-foreground">Edit Profile</h3>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={handleSubmit}
              className="p-6 space-y-6 overflow-y-auto max-h-[80vh] custom-scrollbar"
            >
              {error && (
                <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </p>
              )}

              {/* Avatar Section — same structure as Firebase version */}
              <div className="flex flex-col items-center gap-4">
                <div className="relative group">
                  <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border-4 border-background bg-muted shadow-lg">
                    {avatarPreview ? (
                      <img
                        src={avatarPreview}
                        alt="Avatar"
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <span className="text-2xl font-bold text-muted-foreground">
                        {displayName
                          .split(' ')
                          .map((n) => n[0])
                          .join('')
                          .toUpperCase()}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute bottom-0 right-0 transform rounded-full bg-primary p-2 text-primary-foreground shadow-lg transition-all hover:scale-110 hover:bg-primary/90"
                  >
                    <Camera className="w-4 h-4" />
                  </button>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleAvatarChange}
                    accept="image/*"
                    className="hidden"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Click the camera icon to change your avatar
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-foreground">
                    Full Name
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      maxLength={120}
                      className="w-full rounded-lg border border-input bg-background py-2 pl-10 pr-4 text-foreground transition-all placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20"
                      placeholder="John Doe"
                      disabled={saving}
                    />
                  </div>
                </div>

                {/* Bio */}
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-foreground">
                    Bio{' '}
                    <span className="text-xs font-normal text-muted-foreground">(optional)</span>
                  </label>
                  <textarea
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    rows={3}
                    maxLength={500}
                    disabled={saving}
                    className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20 disabled:opacity-50"
                    placeholder="A short intro shown to your workspace…"
                  />
                  <p className="mt-0.5 text-right text-xs text-muted-foreground">
                    {bio.length}/500
                  </p>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-foreground">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="email"
                      value={profile?.email ?? ''}
                      readOnly
                      className="w-full cursor-not-allowed rounded-lg border border-input bg-muted/60 py-2 pl-10 pr-4 text-muted-foreground focus:outline-none"
                      placeholder="you@example.com"
                    />
                  </div>
                  <p className="mt-1.5 text-[10px] text-muted-foreground">
                    Email is managed by your sign-in provider.
                  </p>
                </div>

                {permissionsContext && permissionFlags ? (
                  <div className="rounded-xl border border-border bg-muted/40 p-4">
                    <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                      <Shield className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                      Access in this workspace
                    </div>
                    <dl className="space-y-2 text-sm">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                        <dt className="text-muted-foreground">Workspace</dt>
                        <dd className="min-w-0 text-right font-medium text-foreground">
                          {permissionsContext.workspaceName}
                        </dd>
                      </div>
                      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                        <dt className="text-muted-foreground">Workspace role</dt>
                        <dd className="text-right font-medium text-foreground">
                          {workspaceRoleLabel(permissionsContext.workspaceRole)}
                        </dd>
                      </div>
                      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                        <dt className="text-muted-foreground">Channel</dt>
                        <dd className="min-w-0 max-w-[12rem] truncate text-right font-medium text-foreground">
                          {permissionsContext.selectedBubbleLabel}
                        </dd>
                      </div>
                      {permissionsContext.bubbleMemberRole ? (
                        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                          <dt className="text-muted-foreground">Channel membership</dt>
                          <dd className="text-right font-medium text-foreground">
                            {bubbleMemberLabel(permissionsContext.bubbleMemberRole)}
                          </dd>
                        </div>
                      ) : null}
                      {permissionsContext.selectedBubbleIsPrivate ? (
                        <p className="text-xs text-muted-foreground">
                          This channel is private; explicit membership can limit tasks and posts.
                        </p>
                      ) : null}
                    </dl>
                    {permissionsContext.selectedBubbleLabel === ALL_BUBBLES_LABEL ? (
                      <p className="mt-2 border-t border-border pt-2 text-xs text-muted-foreground">
                        In &ldquo;All Bubbles&rdquo;, the list below follows general rules; opening
                        a single channel may apply stricter membership.
                      </p>
                    ) : null}
                    <ul
                      className="mt-3 space-y-2 border-t border-border pt-3"
                      aria-label="Capabilities"
                    >
                      <PermissionRow
                        label="View and post messages in this channel"
                        enabled={permissionFlags.canPostMessages}
                      />
                      <PermissionRow
                        label="Create and edit tasks in this channel"
                        enabled={permissionFlags.canWriteTasks}
                      />
                      <PermissionRow
                        label="Create new channels in this workspace"
                        enabled={permissionFlags.canCreateWorkspaceBubble}
                      />
                      <PermissionRow
                        label="Manage workspace (settings, invites, members)"
                        enabled={permissionFlags.isAdmin}
                      />
                      <PermissionRow
                        label="Full workspace ownership (delete, transfer)"
                        enabled={permissionFlags.isOwner}
                      />
                    </ul>
                  </div>
                ) : null}

                <div>
                  <label
                    htmlFor="profile-timezone"
                    className="mb-1.5 block text-sm font-semibold text-foreground"
                  >
                    Timezone
                  </label>
                  <div className="relative">
                    <Globe className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <select
                      id="profile-timezone"
                      value={timezone}
                      onChange={(e) => setTimezone(e.target.value)}
                      disabled={saving}
                      className="w-full cursor-pointer appearance-none rounded-lg border border-input bg-background py-2 pl-10 pr-4 text-foreground transition-all focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20 disabled:opacity-50"
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
                  </div>
                  <p className="mt-1.5 text-[10px] text-muted-foreground">
                    Used for your local date and time display; new workspaces may use this as their
                    default calendar timezone.
                  </p>
                </div>

                {/* Family members — Kids / Community workspaces */}
                {showFamilyNames ? (
                  <div>
                    <label className="mb-1.5 block text-sm font-semibold text-foreground">
                      Family members{' '}
                      <span className="text-xs font-normal text-muted-foreground">(optional)</span>
                    </label>
                    <p className="mb-2 text-xs text-muted-foreground">
                      Children or family member names visible to workspace members. Max 8 names.
                    </p>
                    <div className="space-y-2">
                      {childrenNames.map((n, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <span className="flex-1 rounded-md border border-input bg-muted/40 px-3 py-1.5 text-sm">
                            {n}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeChild(i)}
                            disabled={saving}
                            className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                            aria-label={`Remove ${n}`}
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      ))}
                      {childrenNames.length < 8 ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={newChildName}
                            onChange={(e) => setNewChildName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                addChild();
                              }
                            }}
                            maxLength={64}
                            disabled={saving}
                            className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20 disabled:opacity-50"
                            placeholder="Add a name…"
                          />
                          <button
                            type="button"
                            onClick={addChild}
                            disabled={!newChildName.trim() || saving}
                            className="rounded-md bg-primary p-1.5 text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                            aria-label="Add family member"
                          >
                            <Plus className="size-4" />
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                {/* Password */}
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-foreground">
                    Password{' '}
                    <span className="text-xs font-normal text-muted-foreground">(optional)</span>
                  </label>
                  <p className="mb-2 text-xs text-muted-foreground">
                    Set or update your password for this account. Leave blank to keep your current
                    sign-in method.
                  </p>
                  <div className="space-y-2">
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={saving}
                      autoComplete="new-password"
                      className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20 disabled:opacity-50"
                      placeholder="New password (min 8 characters)"
                    />
                    {password ? (
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        disabled={saving}
                        autoComplete="new-password"
                        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20 disabled:opacity-50"
                        placeholder="Confirm password"
                      />
                    ) : null}
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-foreground">
                    Appearance
                  </label>
                  <ThemeToggle />
                  <p className="mt-1.5 text-[10px] text-muted-foreground">
                    Light, dark, or follow your device. Category theme controls BuddyBubble palettes
                    and accents; choose a preset or match each workspace.
                  </p>
                  <div className="mt-4 space-y-2">
                    <CategoryThemeSelect />
                  </div>
                </div>
              </div>

              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  disabled={saving || signingOut}
                  className="flex-1 rounded-xl border border-border px-4 py-2.5 font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || signingOut || !profile}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 font-semibold text-primary-foreground shadow-lg transition-colors hover:bg-primary/90 disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>

              <div className="border-t border-border pt-4">
                <button
                  type="button"
                  onClick={() => void handleSignOut()}
                  disabled={saving || signingOut}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-destructive/30 px-4 py-2.5 font-semibold text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
                >
                  <LogOut className="w-4 h-4 shrink-0" aria-hidden />
                  {signingOut ? 'Signing out…' : 'Sign out'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
