'use client';

/**
 * subscriptionStore
 *
 * Tracks the current workspace's subscription state on the client so banners,
 * gates, and the trial modal all share the same data without extra fetches.
 *
 * Initialise once per workspace mount:
 *   useSubscriptionStore.getState().initSubscription(workspaceId)
 *
 * Open the trial modal from anywhere:
 *   useSubscriptionStore.getState().openTrialModal()
 */

import { create } from 'zustand';
import type { SubscriptionStatus } from '@/lib/subscription-permissions';
import { createClient } from '@utils/supabase/client';

// The store also needs to represent "free workspace — no subscription required"
type StoreStatus = SubscriptionStatus | 'not_required' | null;

interface SubscriptionStore {
  workspaceId: string | null;
  /** null = not yet loaded */
  status: StoreStatus;
  trialEnd: string | null;
  cancelAtPeriodEnd: boolean;
  loading: boolean;
  /** Controls the StartTrialModal open state */
  trialModalOpen: boolean;

  initSubscription: (workspaceId: string) => Promise<void>;
  refreshSubscription: () => Promise<void>;
  setStatus: (status: StoreStatus) => void;
  openTrialModal: () => void;
  closeTrialModal: () => void;
}

export const useSubscriptionStore = create<SubscriptionStore>((set, get) => ({
  workspaceId: null,
  status: null,
  trialEnd: null,
  cancelAtPeriodEnd: false,
  loading: false,
  trialModalOpen: false,

  initSubscription: async (workspaceId: string) => {
    set({ workspaceId, loading: true });

    try {
      const supabase = createClient();

      // Parallel: fetch workspace category + subscription row
      const [wsResult, subResult] = await Promise.all([
        supabase
          .from('workspaces')
          .select('category_type')
          .eq('id', workspaceId)
          .maybeSingle(),
        supabase
          .from('workspace_subscriptions')
          .select('status, trial_end, cancel_at_period_end')
          .eq('workspace_id', workspaceId)
          .maybeSingle(),
      ]);

      const categoryType = (wsResult.data as { category_type?: string } | null)?.category_type;
      const isPaidWorkspace =
        categoryType === 'business' || categoryType === 'fitness';

      if (!isPaidWorkspace) {
        set({ status: 'not_required', loading: false });
        return;
      }

      const sub = subResult.data as {
        status?: string;
        trial_end?: string | null;
        cancel_at_period_end?: boolean;
      } | null;

      if (!sub) {
        set({ status: 'no_subscription', loading: false });
        return;
      }

      set({
        status: (sub.status ?? 'no_subscription') as StoreStatus,
        trialEnd: sub.trial_end ?? null,
        cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
        loading: false,
      });
    } catch {
      set({ loading: false });
    }
  },

  refreshSubscription: async () => {
    const { workspaceId } = get();
    if (!workspaceId) return;
    // Reset and re-init
    set({ status: null });
    await get().initSubscription(workspaceId);
  },

  setStatus: (status) => set({ status }),
  openTrialModal: () => set({ trialModalOpen: true }),
  closeTrialModal: () => set({ trialModalOpen: false }),
}));
