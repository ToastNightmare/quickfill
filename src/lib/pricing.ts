/**
 * Single source of truth for QuickFill pricing DISPLAY values, derived
 * annual savings, and disclosure strings.
 *
 * Note: this module holds display copy and math only. Stripe price IDs and
 * the intro coupon ID live in server-side env vars (STRIPE_PRO_PRICE_ID,
 * STRIPE_PRO_ANNUAL_PRICE_ID, STRIPE_PRO_INTRO_COUPON_ID) and are never
 * referenced here.
 *
 * Pricing direction (2026-06-13):
 *  - Pro Monthly: A$25/month, with A$12.50 first month via a once-off Stripe
 *    coupon (A$12.50 off the first invoice).
 *  - Pro Annual: A$149/year.
 */

const CURRENCY = "AUD";
const SYMBOL = "A$";

/** Format an AUD amount: whole numbers show no decimals, others show 2 dp. */
export function formatAud(amount: number): string {
  return `${SYMBOL}${Number.isInteger(amount) ? String(amount) : amount.toFixed(2)}`;
}

const PRO_MONTHLY_AMOUNT = 25;
const PRO_MONTHLY_INTRO_AMOUNT = 12.5;
const PRO_ANNUAL_AMOUNT = 149;

// Derived annual figures
const PRO_ANNUAL_PER_MONTH = PRO_ANNUAL_AMOUNT / 12; // ~12.4166...
const PRO_ANNUAL_SAVINGS_VS_MONTHLY = PRO_MONTHLY_AMOUNT * 12 - PRO_ANNUAL_AMOUNT; // 300 - 149 = 151

export const PRICING = {
  currency: CURRENCY,
  symbol: SYMBOL,
  pro: {
    monthly: {
      amount: PRO_MONTHLY_AMOUNT,
      introAmount: PRO_MONTHLY_INTRO_AMOUNT,
      /** "A$25" */
      label: formatAud(PRO_MONTHLY_AMOUNT),
      /** "A$25/month" */
      labelWithPeriod: `${formatAud(PRO_MONTHLY_AMOUNT)}/month`,
      /** "A$12.50" */
      introLabel: formatAud(PRO_MONTHLY_INTRO_AMOUNT),
      /** "A$12.50 first month" */
      introLabelWithPeriod: `${formatAud(PRO_MONTHLY_INTRO_AMOUNT)} first month`,
      /** Required public disclosure for monthly. */
      disclosure: `${formatAud(PRO_MONTHLY_INTRO_AMOUNT)} first month, then ${formatAud(PRO_MONTHLY_AMOUNT)}/month. Cancel anytime.`,
    },
    annual: {
      amount: PRO_ANNUAL_AMOUNT,
      /** "A$149" */
      label: formatAud(PRO_ANNUAL_AMOUNT),
      /** "A$149/year" */
      labelWithPeriod: `${formatAud(PRO_ANNUAL_AMOUNT)}/year`,
      perMonthEquivalent: PRO_ANNUAL_PER_MONTH,
      /** "A$12.42/month" */
      perMonthLabel: `${formatAud(Number(PRO_ANNUAL_PER_MONTH.toFixed(2)))}/month`,
      savingsVsMonthly: PRO_ANNUAL_SAVINGS_VS_MONTHLY,
      /** "save A$151 vs monthly" */
      savingsLabel: `save ${formatAud(PRO_ANNUAL_SAVINGS_VS_MONTHLY)} vs monthly`,
      /** Required public disclosure for annual. */
      disclosure: `${formatAud(PRO_ANNUAL_AMOUNT)}/year. Cancel anytime.`,
    },
  },
} as const;

export type Pricing = typeof PRICING;
