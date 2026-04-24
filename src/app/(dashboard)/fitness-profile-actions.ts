'use server';

import { createClient } from '@utils/supabase/server';

export type SetFitnessProfileBiometricsPublicResult = { ok: true } | { error: string };

export async function setFitnessProfileBiometricsPublicAction(input: {
  workspaceId: string;
  show: boolean;
}): Promise<SetFitnessProfileBiometricsPublicResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };

  const { error } = await supabase.rpc('set_fitness_profile_biometrics_public', {
    p_workspace_id: input.workspaceId,
    p_show: input.show,
  });
  if (error) return { error: error.message };
  return { ok: true };
}
