/**
 * Single source of truth for QuickFill pricing DISPLAY values, derived
 * annual savings, and disclosure strings.
 *
 * Note: this module holds display copy and math only. Stripe price IDs and
 * the intro price ID lives in server-side env vars (STRIPE_PRO_MONTHLY_PRICE_ID,
 * STRIPE_PRO_MONTHLY_INTRO_PRICE_ID, STRIPE_PRO_ANNUAL_PRICE_ID) and are never
 * referenced here.
 *
 * Pricing direction (2026-06-13):
 *  - Pro Monthly: A$2 today for the 7-day intro, then A$25/month.
 *  - Pro Annual: A$149/year.
 */

const CURRENCY = "AUD";
const SYMBOL = "A$";

/** Format an AUD amount: whole numbers show no decimals, others show 2 dp. */
export function formatAud(amount: number): string {
  return `${SYMBOL}${Number.isInteger(amount) ? String(amount) : amount.toFixed(2)}`;
}

const PRO_MONTHLY_AMOUNT = 25;
const PRO_MONTHLY_INTRO_AMOUNT = 2;
const PRO_MONTHLY_INTRO_DAYS = 7;
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
      introDays: PRO_MONTHLY_INTRO_DAYS,
      /** "A$25" */
      label: formatAud(PRO_MONTHLY_AMOUNT),
      /** "A$25/month" */
      labelWithPeriod: `${formatAud(PRO_MONTHLY_AMOUNT)}/month`,
      /** "A$2" */
      introLabel: formatAud(PRO_MONTHLY_INTRO_AMOUNT),
      /** "A$2 today" */
      introTodayLabel: `${formatAud(PRO_MONTHLY_INTRO_AMOUNT)} today`,
      /** Intro badge text */
      introBadge: "7-day intro offer",
      /** "Then A$25/month after 7 days" */
      thenLabel: `Then ${formatAud(PRO_MONTHLY_AMOUNT)}/month after ${PRO_MONTHLY_INTRO_DAYS} days`,
      /** Primary monthly CTA */
      ctaLabel: `Start 7-day intro for ${formatAud(PRO_MONTHLY_INTRO_AMOUNT)}`,
      /** Fine print under the monthly CTA */
      finePrint: `${formatAud(PRO_MONTHLY_INTRO_AMOUNT)} today. Then ${formatAud(PRO_MONTHLY_AMOUNT)}/month after ${PRO_MONTHLY_INTRO_DAYS} days unless cancelled.`,
      /** Required public disclosure for monthly. */
      disclosure: `${formatAud(PRO_MONTHLY_INTRO_AMOUNT)} today for the ${PRO_MONTHLY_INTRO_DAYS}-day intro, then ${formatAud(PRO_MONTHLY_AMOUNT)}/month. Cancel anytime.`,
      /** Google Ads + Meta conversion value (actual first charge). */
      conversionValue: PRO_MONTHLY_INTRO_AMOUNT,
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
      /** "A$12.42/month billed annually" */
      perMonthBilledAnnually: `${formatAud(Number(PRO_ANNUAL_PER_MONTH.toFixed(2)))}/month billed annually`,
      /** "or A$149/year" */
      orLabel: `or ${formatAud(PRO_ANNUAL_AMOUNT)}/year`,
      /** Secondary annual CTA */
      ctaLabel: `Save with annual ${formatAud(PRO_ANNUAL_AMOUNT)}`,
      savingsVsMonthly: PRO_ANNUAL_SAVINGS_VS_MONTHLY,
      /** "save A$151 vs monthly" */
      savingsLabel: `save ${formatAud(PRO_ANNUAL_SAVINGS_VS_MONTHLY)} vs monthly`,
      /** "Save A$151 vs monthly" (capitalised) */
      savingsLabelCap: `Save ${formatAud(PRO_ANNUAL_SAVINGS_VS_MONTHLY)} vs monthly`,
      /** Required public disclosure for annual. */
      disclosure: `${formatAud(PRO_ANNUAL_AMOUNT)}/year. Cancel anytime.`,
      /** Google Ads + Meta conversion value (actual first charge). */
      conversionValue: PRO_ANNUAL_AMOUNT,
    },
  },
} as const;

export type Pricing = typeof PRICING;
