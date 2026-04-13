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
import { isPaidWorkspaceCategory, type SubscriptionStatus } from '@/lib/subscription-permissions';
import type { WorkspaceCategory } from '@/types/database';
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
  /**
   * false = user already consumed their one free trial (subscribe without trial only).
   * null when subscription not applicable or not loaded.
   */
  trialAvailable: boolean | null;
  /** Controls the StartTrialModal open state */
  trialModalOpen: boolean;

  initSubscription: (workspaceId: string) => Promise<void>;
  refreshSubscription: () => Promise<void>;
  setStatus: (status: StoreStatus) => void;
  /** Sync after /api/stripe/setup-intent if needed (source of truth matches DB). */
  setTrialAvailable: (trialAvailable: boolean | null) => void;
  openTrialModal: () => void;
  closeTrialModal: () => void;
}

export const useSubscriptionStore = create<SubscriptionStore>((set, get) => ({
  workspaceId: null,
  status: null,
  trialEnd: null,
  cancelAtPeriodEnd: false,
  loading: false,
  trialAvailable: null,
  trialModalOpen: false,

  initSubscription: async (workspaceId: string) => {
    set({
      workspaceId,
      loading: true,
      status: null,
      trialEnd: null,
      cancelAtPeriodEnd: false,
      trialAvailable: null,
    });

    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      // Parallel: workspace category, subscription row, one-trial flag
      const [wsResult, subResult, customerResult] = await Promise.all([
        supabase.from('workspaces').select('category_type').eq('id', workspaceId).maybeSingle(),
        supabase
          .from('workspace_subscriptions')
          .select('status, trial_end, cancel_at_period_end')
          .eq('workspace_id', workspaceId)
          .maybeSingle(),
        user
          ? supabase
              .from('stripe_customers')
              .select('has_had_trial')
              .eq('user_id', user.id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

      const categoryType = (wsResult.data as { category_type?: string } | null)?.category_type as
        | WorkspaceCategory
        | undefined;

      if (categoryType !== undefined && !isPaidWorkspaceCategory(categoryType)) {
        set({ status: 'not_required', trialAvailable: null, loading: false });
        return;
      }

      if (!categoryType || !isPaidWorkspaceCategory(categoryType)) {
        set({
          status: 'no_subscription',
          trialEnd: null,
          cancelAtPeriodEnd: false,
          trialAvailable: null,
          loading: false,
        });
        return;
      }

      const stripeRow = customerResult.data as { has_had_trial?: boolean } | null;
      const trialAvailable = user == null ? null : !stripeRow?.has_had_trial;

      const sub = subResult.data as {
        status?: string;
        trial_end?: string | null;
        cancel_at_period_end?: boolean;
      } | null;

      if (!sub) {
        set({ status: 'no_subscription', trialAvailable, loading: false });
        return;
      }

      set({
        status: (sub.status ?? 'no_subscription') as StoreStatus,
        trialEnd: sub.trial_end ?? null,
        cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
        trialAvailable,
        loading: false,
      });
    } catch {
      set({
        loading: false,
        status: null,
        trialEnd: null,
        cancelAtPeriodEnd: false,
        trialAvailable: null,
      });
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
  setTrialAvailable: (trialAvailable) => set({ trialAvailable }),
  openTrialModal: () => set({ trialModalOpen: true }),
  closeTrialModal: () => set({ trialModalOpen: false }),
}));
