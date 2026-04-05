'use client';

import React, { useState, useRef, useEffect } from 'react';
import { X, Camera, Save, User, Mail, Globe } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { createClient } from '@utils/supabase/client';
import { useUserProfileStore, type UserProfileRow } from '@/store/userProfileStore';
import { AVATARS_BUCKET, buildAvatarObjectPath } from '@/lib/avatar-storage';
import { formatUserFacingError } from '@/lib/format-error';
import { isMissingColumnSchemaCacheError } from '@/lib/supabase-schema-errors';
import { COMMON_CALENDAR_TIMEZONES } from '@/lib/calendar-timezones';

export type ProfileModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function ProfileModal({ open, onOpenChange }: ProfileModalProps) {
  const profile = useUserProfileStore((s) => s.profile);
  const setProfile = useUserProfileStore((s) => s.setProfile);
  const loadProfile = useUserProfileStore((s) => s.loadProfile);

  const [name, setName] = useState('');
  const [timezone, setTimezone] = useState('UTC');
  const [avatarPreview, setAvatarPreview] = useState('');
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    void loadProfile();
  }, [open, loadProfile]);

  useEffect(() => {
    if (!open) return;
    if (!profile) return;
    setName(profile.full_name?.trim() || '');
    setTimezone(profile.timezone?.trim() || 'UTC');
    setAvatarPreview(profile.avatar_url ?? '');
    setPendingFile(null);
  }, [open, profile]);

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
      setSaving(false);
      onOpenChange(false);
    } catch (err) {
      setError(formatUserFacingError(err));
      setSaving(false);
    }
  };

  const displayName = name || 'Member';

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => onOpenChange(false)}
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col"
            onClick={(ev) => ev.stopPropagation()}
          >
            <div className="flex items-center justify-between p-6 border-b border-slate-100 shrink-0">
              <h3 className="text-xl font-bold text-slate-900">Edit Profile</h3>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={handleSubmit}
              className="p-6 space-y-6 overflow-y-auto max-h-[80vh] custom-scrollbar"
            >
              {error && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}

              {/* Avatar Section — same structure as Firebase version */}
              <div className="flex flex-col items-center gap-4">
                <div className="relative group">
                  <div className="w-24 h-24 rounded-full bg-slate-100 border-4 border-white shadow-lg overflow-hidden flex items-center justify-center">
                    {avatarPreview ? (
                      <img
                        src={avatarPreview}
                        alt="Avatar"
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <span className="text-2xl font-bold text-slate-400">
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
                    className="absolute bottom-0 right-0 p-2 bg-indigo-600 text-white rounded-full shadow-lg hover:bg-indigo-700 transition-all transform hover:scale-110"
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
                <p className="text-xs text-slate-500">
                  Click the camera icon to change your avatar
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                    Full Name
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                      placeholder="John Doe"
                      disabled={saving}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="email"
                      value={profile?.email ?? ''}
                      readOnly
                      className="w-full pl-10 pr-4 py-2 bg-slate-100 border border-slate-200 rounded-lg text-slate-600 cursor-not-allowed focus:outline-none"
                      placeholder="you@example.com"
                    />
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1.5">
                    Email is managed by your sign-in provider.
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="profile-timezone"
                    className="block text-sm font-semibold text-slate-700 mb-1.5"
                  >
                    Timezone
                  </label>
                  <div className="relative">
                    <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    <select
                      id="profile-timezone"
                      value={timezone}
                      onChange={(e) => setTimezone(e.target.value)}
                      disabled={saving}
                      className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all appearance-none cursor-pointer disabled:opacity-50"
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
                  <p className="text-[10px] text-slate-400 mt-1.5">
                    Used for your local date and time display; new workspaces may use this as their
                    default calendar timezone.
                  </p>
                </div>
              </div>

              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  disabled={saving}
                  className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-600 font-semibold rounded-xl hover:bg-slate-50 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || !profile}
                  className="flex-1 px-4 py-2.5 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/20 disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
