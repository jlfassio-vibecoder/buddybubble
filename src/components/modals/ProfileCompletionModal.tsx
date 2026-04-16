'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { motion } from 'motion/react';
import { Camera, Mail, Plus, Save, Trash2, User } from 'lucide-react';
import { createClient } from '@utils/supabase/client';
import { useUserProfileStore, type UserProfileRow } from '@/store/userProfileStore';
import {
  AVATARS_BUCKET,
  buildAvatarObjectPath,
  extractAvatarObjectPath,
} from '@/lib/avatar-storage';
import { formatUserFacingError } from '@/lib/format-error';
import { completeProfileGateAction } from '@/app/(dashboard)/profile-actions';
import { reportProfileCompletionJourneyStepAction } from '@/app/(dashboard)/profile-completion-analytics-actions';
import { setWorkspaceMemberShowEmailAction } from '@/app/(dashboard)/workspace-member-email-actions';

type Props = {
  profile: UserProfileRow;
  /** Show the Family members section (Kids / Community workspace). */
  showFamilyNames: boolean;
  /** When set, member can choose whether peers see their email in this workspace. */
  workspaceId?: string | null;
  /** Called after a successful save — parent should reload the profile store. */
  onComplete: () => void;
};

export function ProfileCompletionModal({
  profile,
  showFamilyNames,
  workspaceId,
  onComplete,
}: Props) {
  const setStoreProfile = useUserProfileStore((s) => s.setProfile);

  const [name, setName] = useState(profile.full_name?.trim() ?? '');
  const [bio, setBio] = useState(profile.bio?.trim() ?? '');
  const [childrenNames, setChildrenNames] = useState<string[]>(profile.children_names ?? []);
  const [newChildName, setNewChildName] = useState('');
  const [email, setEmail] = useState(() => profile.email?.trim() ?? '');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [avatarPreview, setAvatarPreview] = useState(profile.avatar_url ?? '');
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [showEmailToPeers, setShowEmailToPeers] = useState(false);
  const [emailVisibilityLoaded, setEmailVisibilityLoaded] = useState(!workspaceId);
  const [emailVisibilityPending, setEmailVisibilityPending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const profileJourneyLogged = useRef(false);

  const emailTrimmed = email.trim();
  const emailLooksValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrimmed);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled || !user?.email?.trim()) return;
      setEmail((prev) => (prev.trim() ? prev : user.email!.trim()));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (profileJourneyLogged.current) return;
    profileJourneyLogged.current = true;
    void reportProfileCompletionJourneyStepAction({
      workspaceId,
      step: 'profile_completion_modal_shown',
      detail: { has_name: Boolean(profile.full_name?.trim()) },
    });
  }, [workspaceId, profile.full_name]);

  useEffect(() => {
    if (!workspaceId) {
      setEmailVisibilityLoaded(true);
      return;
    }
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      const { data, error } = await supabase
        .from('workspace_members')
        .select('show_email_to_workspace_members')
        .eq('workspace_id', workspaceId)
        .eq('user_id', user.id)
        .maybeSingle();
      if (cancelled) return;
      if (error || !data) {
        setEmailVisibilityLoaded(true);
        return;
      }
      setShowEmailToPeers(Boolean(data.show_email_to_workspace_members));
      setEmailVisibilityLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  const displayInitials = name.trim()
    ? name
        .trim()
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : '?';

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowed.includes(file.type)) {
      setError('Avatar must be a JPEG, PNG, WebP, or GIF.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Avatar must be 5 MB or smaller.');
      return;
    }
    setPendingFile(file);
    setError(null);
    const reader = new FileReader();
    reader.onloadend = () => setAvatarPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const addChild = () => {
    const n = newChildName.trim();
    if (!n || n.length > 64 || childrenNames.length >= 8) return;
    setChildrenNames((prev) => [...prev, n]);
    setNewChildName('');
  };

  const removeChild = (idx: number) => {
    setChildrenNames((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSave = () => {
    const trimmedName = name.trim();
    const pwTrimmed = password.trim();
    const confirmTrimmed = confirmPassword.trim();
    if (!trimmedName) {
      setError('Please enter your display name to continue.');
      return;
    }
    if (trimmedName.length > 120) {
      setError('Display name must be 120 characters or fewer.');
      return;
    }
    // Copilot suggestion ignored: this modal is for anonymous recovery; requiring a password is intentional until OAuth-only completion is a separate flow.
    if (!pwTrimmed) {
      setError(
        'Please choose a password so you can sign in again on another device or after this session ends.',
      );
      return;
    }
    if (pwTrimmed.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (pwTrimmed !== confirmTrimmed) {
      setError('Passwords do not match.');
      return;
    }
    const emailTrim = email.trim();
    if (!emailTrim || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrim)) {
      setError('A valid email is required to secure your account.');
      return;
    }

    setError(null);
    startTransition(async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setError('Not signed in.');
        return;
      }

      // 1. Upload avatar (client-side — File not serialisable to server action)
      let nextAvatarUrl: string | null = profile.avatar_url ?? null;
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
          return;
        }
        const { data: pub } = supabase.storage.from(AVATARS_BUCKET).getPublicUrl(path);
        nextAvatarUrl = pub.publicUrl;
      }

      const normalizedChildren = childrenNames.map((n) => n.trim()).filter(Boolean);

      const result = await completeProfileGateAction({
        fullName: trimmedName,
        bio: bio.trim() || null,
        childrenNames: normalizedChildren,
        avatarUrl: nextAvatarUrl,
        email: emailTrim,
        password: pwTrimmed,
      });
      if ('error' in result) {
        setError(result.error);
        return;
      }

      if (pendingFile && profile.avatar_url && nextAvatarUrl) {
        const oldPath = extractAvatarObjectPath(profile.avatar_url);
        const newPath = extractAvatarObjectPath(nextAvatarUrl);
        if (oldPath && newPath && oldPath !== newPath) {
          void supabase.storage.from(AVATARS_BUCKET).remove([oldPath]);
        }
      }

      void reportProfileCompletionJourneyStepAction({
        workspaceId,
        step: 'profile_completion_modal_completed',
        detail: {},
      });

      const savedProfile: UserProfileRow = {
        ...profile,
        full_name: trimmedName,
        bio: bio.trim() || null,
        children_names: normalizedChildren,
        avatar_url: nextAvatarUrl,
        email: emailTrim,
      };
      setStoreProfile(savedProfile);
      onComplete();
    });
  };

  const pwTrimmedForUi = password.trim();
  const confirmTrimmedForUi = confirmPassword.trim();
  /** Password step complete: min length + match (confirm field only appears once user starts typing a password). */
  const passwordReady = pwTrimmedForUi.length >= 8 && pwTrimmedForUi === confirmTrimmedForUi;
  const showConfirmPassword = pwTrimmedForUi.length > 0;
  const emailReady = emailLooksValid && emailTrimmed.length <= 254;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      {/* Non-interactive backdrop — no click-to-close */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="relative flex w-full max-w-md flex-col overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="shrink-0 border-b border-border p-6 pb-4">
          <h3 className="text-xl font-bold text-foreground">Welcome — set up your profile</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Your name is shown to everyone in socialspaces you share. Add a photo and bio so people
            can recognise you.
          </p>
        </div>

        {/* Scrollable body */}
        <div className="max-h-[72vh] overflow-y-auto p-6">
          <div className="space-y-6">
            {error ? (
              <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            ) : null}

            {/* Avatar — optional */}
            <div className="flex flex-col items-center gap-3">
              <div className="relative">
                <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border-4 border-background bg-muted shadow-lg">
                  {avatarPreview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={avatarPreview}
                      alt="Avatar preview"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-2xl font-bold text-muted-foreground">
                      {displayInitials}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute bottom-0 right-0 rounded-full bg-primary p-2 text-primary-foreground shadow-lg transition-all hover:bg-primary/90"
                  aria-label="Upload avatar"
                >
                  <Camera className="h-4 w-4" />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  onChange={handleAvatarChange}
                  className="hidden"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Optional — click the camera icon to add a photo
              </p>
            </div>

            {/* Display name — required */}
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-foreground">
                Display name{' '}
                <span className="text-destructive" aria-hidden>
                  *
                </span>
              </label>
              <div className="relative">
                <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={120}
                  // eslint-disable-next-line jsx-a11y/no-autofocus
                  autoFocus
                  disabled={pending}
                  className="w-full rounded-lg border border-input bg-background py-2 pl-10 pr-4 text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20 disabled:opacity-50"
                  placeholder="Your name"
                />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Shown to members in socialspaces you share.
              </p>
            </div>

            {/* Email — required for account recovery and workspace identity */}
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-foreground">
                Email{' '}
                <span className="text-destructive" aria-hidden>
                  *
                </span>
              </label>
              <p className="mb-2 text-xs text-muted-foreground">
                Used to secure your account and so hosts can recognise you. You can use a different
                address from the one that received an invite link.
              </p>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  disabled={pending}
                  className="w-full rounded-lg border border-input bg-background py-2 pl-10 pr-4 text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20 disabled:opacity-50"
                  placeholder="you@example.com"
                />
              </div>
            </div>

            {/* Bio — optional */}
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-foreground">
                Bio <span className="text-xs font-normal text-muted-foreground">(optional)</span>
              </label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={3}
                maxLength={500}
                disabled={pending}
                className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20 disabled:opacity-50"
                placeholder="A short intro shown to your socialspace…"
              />
              <p className="mt-0.5 text-right text-xs text-muted-foreground">{bio.length}/500</p>
            </div>

            {/* Family members — Kids / Community workspaces */}
            {workspaceId && emailVisibilityLoaded ? (
              <div className="rounded-lg border border-border bg-muted/30 p-4">
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={showEmailToPeers}
                    disabled={emailVisibilityPending}
                    onChange={(e) => {
                      const next = e.target.checked;
                      setShowEmailToPeers(next);
                      setEmailVisibilityPending(true);
                      void (async () => {
                        const res = await setWorkspaceMemberShowEmailAction({
                          workspaceId,
                          show: next,
                        });
                        setEmailVisibilityPending(false);
                        if ('error' in res) {
                          setShowEmailToPeers(!next);
                          setError(res.error);
                        }
                      })();
                    }}
                    className="mt-1 size-4 shrink-0 rounded border-input"
                  />
                  <span>
                    <span className="block text-sm font-semibold text-foreground">
                      Show my email to others in this BuddyBubble
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      Off by default — members won&apos;t see your address in chat or mentions
                      unless you turn this on. Socialspace owners and admins can still see it for
                      support.
                    </span>
                  </span>
                </label>
              </div>
            ) : null}

            {showFamilyNames ? (
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-foreground">
                  Family members{' '}
                  <span className="text-xs font-normal text-muted-foreground">(optional)</span>
                </label>
                <p className="mb-2 text-xs text-muted-foreground">
                  Children or family member names visible to socialspace members. Max 8 names.
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
                        disabled={pending}
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
                        disabled={pending}
                        className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20 disabled:opacity-50"
                        placeholder="Add a name…"
                      />
                      <button
                        type="button"
                        onClick={addChild}
                        disabled={!newChildName.trim() || pending}
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

            {/* Password — required: sign in again without relying on this browser session */}
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-foreground">
                Password{' '}
                <span className="text-destructive" aria-hidden>
                  *
                </span>
              </label>
              <p className="mb-2 text-xs text-muted-foreground">
                Required so you can open BuddyBubble on another device or if this session ends (e.g.
                after leaving anonymous guest sign-in). Applies to this account everywhere on this
                platform.
              </p>
              <div className="space-y-2">
                <input
                  type="password"
                  value={password}
                  onChange={(e) => {
                    const v = e.target.value;
                    setPassword(v);
                    if (!v.trim()) setConfirmPassword('');
                  }}
                  disabled={pending}
                  autoComplete="new-password"
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20 disabled:opacity-50"
                  placeholder="Password (min 8 characters)"
                />
                {showConfirmPassword ? (
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    disabled={pending}
                    autoComplete="new-password"
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20 disabled:opacity-50"
                    placeholder="Confirm password"
                  />
                ) : null}
              </div>
            </div>
          </div>
        </div>

        {/* Footer — save button */}
        <div className="shrink-0 border-t border-border p-6 pt-4">
          <button
            type="button"
            onClick={handleSave}
            disabled={pending || !name.trim() || !emailReady || !passwordReady}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 font-semibold text-primary-foreground shadow-lg transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {pending ? 'Saving…' : 'Save & continue'}
          </button>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            You can update these details any time from your profile.
          </p>
        </div>
      </motion.div>
    </div>
  );
}
