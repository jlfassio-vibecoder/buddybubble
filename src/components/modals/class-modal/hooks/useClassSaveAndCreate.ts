'use client';

import type { Dispatch, SetStateAction } from 'react';
import { useCallback } from 'react';
import { toast } from 'sonner';
import { createClient } from '@utils/supabase/client';
import type { Json } from '@/types/database';
import { formatUserFacingError } from '@/lib/format-error';

export type ClassOfferingSavePart = {
  workspace_id: string;
  name: string;
  description: string | null;
  duration_min: number;
  location: string | null;
  metadata: Json;
};

export type ClassInstanceSavePart = {
  workspace_id: string;
  scheduled_at: string;
  capacity: number | null;
  instructor_notes: string | null;
  metadata: Json;
};

export type ClassSavePayload = {
  offering: ClassOfferingSavePart;
  instance: ClassInstanceSavePart;
};

function rlsFriendlyMessage(message: string): string {
  const lower = message.toLowerCase();
  if (
    lower.includes('permission denied') ||
    lower.includes('row-level security') ||
    lower.includes('violates row-level security') ||
    lower.includes('new row violates')
  ) {
    return 'Only workspace owners and admins can create or edit classes.';
  }
  return message;
}

export type UseClassSaveAndCreateArgs = {
  setError: Dispatch<SetStateAction<string | null>>;
  setSaving: Dispatch<SetStateAction<boolean>>;
  onCreated?: (ids: { offeringId: string; instanceId: string }) => void;
  onSaved?: () => void;
};

export function useClassSaveAndCreate({
  setError,
  setSaving,
  onCreated,
  onSaved,
}: UseClassSaveAndCreateArgs) {
  const createClass = useCallback(
    async (
      payload: ClassSavePayload,
    ): Promise<{ offeringId: string; instanceId: string } | null> => {
      setSaving(true);
      setError(null);
      const supabase = createClient();

      const { data: offeringRow, error: oErr } = await supabase
        .from('class_offerings')
        .insert({
          workspace_id: payload.offering.workspace_id,
          name: payload.offering.name,
          description: payload.offering.description,
          duration_min: payload.offering.duration_min,
          location: payload.offering.location,
          metadata: payload.offering.metadata,
        })
        .select('id')
        .maybeSingle();

      if (oErr || !offeringRow?.id) {
        const msg = rlsFriendlyMessage(
          formatUserFacingError(oErr ?? new Error('Create offering failed')),
        );
        setError(msg);
        toast.error(msg);
        setSaving(false);
        return null;
      }

      const offeringId = offeringRow.id as string;

      const { data: instRow, error: iErr } = await supabase
        .from('class_instances')
        .insert({
          workspace_id: payload.instance.workspace_id,
          offering_id: offeringId,
          scheduled_at: payload.instance.scheduled_at,
          capacity: payload.instance.capacity,
          instructor_notes: payload.instance.instructor_notes,
          metadata: payload.instance.metadata,
        })
        .select('id')
        .maybeSingle();

      if (iErr || !instRow?.id) {
        const msg = rlsFriendlyMessage(
          formatUserFacingError(iErr ?? new Error('Create class instance failed')),
        );
        setError(msg);
        toast.error(msg);
        setSaving(false);
        return null;
      }

      const instanceId = instRow.id as string;
      toast.success('Class created');
      onCreated?.({ offeringId, instanceId });
      setSaving(false);
      return { offeringId, instanceId };
    },
    [onCreated, setError, setSaving],
  );

  const saveClass = useCallback(
    async (offeringId: string, instanceId: string, payload: ClassSavePayload): Promise<boolean> => {
      setSaving(true);
      setError(null);
      const supabase = createClient();
      const now = new Date().toISOString();

      const { error: oErr } = await supabase
        .from('class_offerings')
        .update({
          name: payload.offering.name,
          description: payload.offering.description,
          duration_min: payload.offering.duration_min,
          location: payload.offering.location,
          metadata: payload.offering.metadata,
          updated_at: now,
        })
        .eq('id', offeringId);

      if (oErr) {
        const msg = rlsFriendlyMessage(formatUserFacingError(oErr));
        setError(msg);
        toast.error(msg);
        setSaving(false);
        return false;
      }

      const { error: iErr } = await supabase
        .from('class_instances')
        .update({
          scheduled_at: payload.instance.scheduled_at,
          capacity: payload.instance.capacity,
          instructor_notes: payload.instance.instructor_notes,
          metadata: payload.instance.metadata,
          updated_at: now,
        })
        .eq('id', instanceId);

      if (iErr) {
        const msg = rlsFriendlyMessage(formatUserFacingError(iErr));
        setError(msg);
        toast.error(msg);
        setSaving(false);
        return false;
      }

      toast.success('Class saved');
      onSaved?.();
      setSaving(false);
      return true;
    },
    [onSaved, setError, setSaving],
  );

  return { createClass, saveClass };
}
