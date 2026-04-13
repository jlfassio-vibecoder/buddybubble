/**
 * Stripe Elements Appearance API — aligned with shadcn `bg-card` / `.dark` palette
 * so PaymentElement labels, tabs, and inputs are readable (no dark-on-dark, no
 * harsh white fields on charcoal dialogs).
 *
 * @see https://docs.stripe.com/elements/appearance-api
 */

const FONT =
  "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Inter', sans-serif";

/** ~ oklch(0.205) — matches `--card` in globals `.dark` */
const CARD = '#1f1f1f';
/** Slightly elevated field surface */
const FIELD = '#2a2a2a';
const FIELD_BORDER = 'rgba(255, 255, 255, 0.12)';
const TEXT = '#fafafa';
const LABEL = '#e4e4e7';
const MUTED = '#a1a1aa';
const TAB_IDLE = '#2d2d2d';
const TAB_HOVER = '#333333';
const TAB_SELECTED = '#3a3a3a';

export function getStripeBillingElementsAppearance(isDark: boolean) {
  if (!isDark) {
    return {
      theme: 'stripe' as const,
      variables: {
        borderRadius: '8px',
        fontFamily: FONT,
      },
    };
  }

  return {
    theme: 'night' as const,
    variables: {
      borderRadius: '8px',
      fontFamily: FONT,
      fontSizeBase: '16px',
      spacingUnit: '3px',
      gridRowSpacing: '14px',
      colorPrimary: '#e4e4e7',
      colorBackground: CARD,
      colorText: TEXT,
      colorDanger: '#f87171',
      colorSuccess: '#4ade80',
      tabIconSelectedColor: TEXT,
      tabIconDefaultColor: MUTED,
    },
    rules: {
      '.Tab': {
        backgroundColor: TAB_IDLE,
        color: LABEL,
        border: `1px solid ${FIELD_BORDER}`,
        boxShadow: 'none',
      },
      '.Tab:hover': {
        backgroundColor: TAB_HOVER,
        color: TEXT,
        borderColor: 'rgba(255, 255, 255, 0.16)',
      },
      '.Tab--selected': {
        backgroundColor: TAB_SELECTED,
        color: TEXT,
        borderColor: 'rgba(255, 255, 255, 0.2)',
      },
      '.TabIcon': {
        color: 'currentColor',
        fill: 'currentColor',
      },
      '.Label': {
        color: LABEL,
        fontWeight: '500',
        fontSize: '13px',
      },
      '.Input': {
        backgroundColor: FIELD,
        color: TEXT,
        border: `1px solid ${FIELD_BORDER}`,
        boxShadow: 'none',
      },
      '.Input:focus': {
        borderColor: 'rgba(255, 255, 255, 0.28)',
        boxShadow: '0 0 0 1px rgba(255, 255, 255, 0.1)',
      },
      '.Input--invalid': {
        borderColor: '#f87171',
        boxShadow: 'none',
      },
      '.Block': {
        backgroundColor: 'transparent',
        borderColor: FIELD_BORDER,
      },
      '.TermsText': {
        color: MUTED,
        fontSize: '12px',
        lineHeight: '1.45',
      },
    },
  };
}
