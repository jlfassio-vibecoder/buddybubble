/**
 * Growth Engine — shared event taxonomy.
 *
 * EventType is the single source of truth for every event written to
 * `analytics_events`. Keep in sync with the TDD event table in docs.
 */

// ── Event type union ──────────────────────────────────────────────────────────

export type FunnelEventType =
  | 'lead_captured'
  | 'auth_modal_opened'
  | 'signup_completed'
  | 'trial_started'
  | 'trial_converted'
  | 'trial_canceled'
  | 'subscription_canceled'
  | 'subscription_restarted';

export type GateEventType = 'feature_gate_hit' | 'premium_feature_used';

export type NavigationEventType = 'page_view' | 'session_start';

/** Workspace-scoped invite / QR funnel (metadata.step = InviteJourneyStep). */
export type InviteJourneyEventType = 'invite_journey_step';

export type EventType =
  | FunnelEventType
  | GateEventType
  | NavigationEventType
  | InviteJourneyEventType;

// ── Feature name values (must match PremiumGate / dashboards) ─────────────────

export type FeatureName =
  | 'ai'
  | 'analytics'
  | 'export'
  | 'record_data'
  | 'custom_branding'
  | 'create_workspace';

// ── Metadata shapes per event ─────────────────────────────────────────────────

export interface LeadCapturedMeta {
  source: string;
  invite_token?: string;
}

export interface AuthModalOpenedMeta {
  feature_name: FeatureName;
}

export interface TrialStartedMeta {
  plan: string;
}

export interface TrialConvertedMeta {
  plan: string;
  trial_duration_days: number;
}

export interface TrialCanceledMeta {
  days_into_trial: number;
}

export interface SubscriptionCanceledMeta {
  months_active: number;
}

export interface FeatureGateHitMeta {
  feature_name: FeatureName;
  /** Subscription status at time of gate hit. */
  user_status: string;
}

export interface PremiumFeatureUsedMeta {
  feature_name: FeatureName;
}

export interface PageViewMeta {
  path: string;
  referrer?: string;
}

export interface SessionStartMeta {
  referrer?: string;
}

// ── Canonical event payload (matches analytics_events row shape) ──────────────

export interface AnalyticsEventPayload {
  event_type: EventType;
  workspace_id?: string | null;
  user_id?: string | null;
  lead_id?: string | null;
  session_id?: string | null;
  path?: string | null;
  metadata: Record<string, unknown>;
}
