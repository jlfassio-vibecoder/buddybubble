/**
 * Billing funnel event key constants (safe for Client Components — no server imports).
 */

export const BILLING_FUNNEL_EVENT_KEYS = {
  SETUP_INTENT_STARTED: 'billing_setup_intent_started',
  SETUP_INTENT_FAILED: 'billing_setup_intent_failed',
  SUBSCRIPTION_CREATE_STARTED: 'billing_subscription_create_started',
  SUBSCRIPTION_SUCCEEDED: 'billing_subscription_succeeded',
  SUBSCRIPTION_FAILED: 'billing_subscription_failed',
  WEBHOOK_INVOICE_PAYMENT_FAILED: 'billing_webhook_invoice_payment_failed',
  WEBHOOK_INVOICE_PAYMENT_SUCCEEDED: 'billing_webhook_invoice_payment_succeeded',
  CLIENT_MODAL_OPENED: 'billing_modal_opened',
  CLIENT_PLAN_SELECTED: 'billing_plan_selected',
  CLIENT_SETUP_SUCCEEDED: 'billing_setup_intent_succeeded',
  CLIENT_SETUP_FAILED: 'billing_setup_intent_failed',
  CLIENT_MODAL_ABANDONED: 'billing_modal_abandoned',
} as const;

export const CLIENT_ALLOWED_BILLING_FUNNEL_KEYS = new Set<string>([
  BILLING_FUNNEL_EVENT_KEYS.CLIENT_MODAL_OPENED,
  BILLING_FUNNEL_EVENT_KEYS.CLIENT_PLAN_SELECTED,
  BILLING_FUNNEL_EVENT_KEYS.CLIENT_SETUP_SUCCEEDED,
  BILLING_FUNNEL_EVENT_KEYS.CLIENT_SETUP_FAILED,
  BILLING_FUNNEL_EVENT_KEYS.CLIENT_MODAL_ABANDONED,
]);
