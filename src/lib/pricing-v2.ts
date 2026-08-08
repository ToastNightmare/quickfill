export type PricingV2Billing = "annual" | "monthly" | "sale";

const INTRO_CENTS = 200;
const INTRO_DAYS = 7;
const MONTHLY_CENTS = 2_500;
const ANNUAL_CENTS = 19_900;
const SALE_CENTS = 15_000;
const MONTHS_PER_YEAR = 12;

function formatAudCents(cents: number, forceTwoDecimals = false) {
  const amount = cents / 100;
  return `A$${forceTwoDecimals || !Number.isInteger(amount) ? amount.toFixed(2) : String(amount)}`;
}

export function savePercent(annualCents: number, monthlyCents: number) {
  const monthlyAnnualizedCents = monthlyCents * MONTHS_PER_YEAR;
  return Math.round(((monthlyAnnualizedCents - annualCents) / monthlyAnnualizedCents) * 100);
}

const introDisplay = formatAudCents(INTRO_CENTS);
const monthlyDisplay = formatAudCents(MONTHLY_CENTS);
const annualDisplay = formatAudCents(ANNUAL_CENTS);
const annualPerMonthDisplay = formatAudCents(ANNUAL_CENTS / MONTHS_PER_YEAR, true);
const saleDisplay = formatAudCents(SALE_CENTS);
const salePerMonthDisplay = formatAudCents(SALE_CENTS / MONTHS_PER_YEAR, true);
const annualSavePercent = savePercent(ANNUAL_CENTS, MONTHLY_CENTS);
const saleSavePercent = savePercent(SALE_CENTS, MONTHLY_CENTS);

export const PRICING_V2 = {
  currency: "AUD",
  hero: `Try ${INTRO_DAYS} days for ${introDisplay}, then ${annualDisplay}/year`,
  intro: {
    cents: INTRO_CENTS,
    days: INTRO_DAYS,
    display: introDisplay,
  },
  annual: {
    cents: ANNUAL_CENTS,
    display: annualDisplay,
    perMonthDisplay: annualPerMonthDisplay,
    cardPrice: `${annualDisplay} / yr (${annualPerMonthDisplay} / mo)`,
    sublabel: `${INTRO_DAYS}-Day ${introDisplay} Trial`,
    savePercent: annualSavePercent,
    badge: `Save ${annualSavePercent}%`,
    cta: `Start ${INTRO_DAYS}-day trial for ${introDisplay}`,
    finePrint: `${introDisplay} today. After ${INTRO_DAYS} days your subscription renews at ${annualDisplay}/year unless cancelled.`,
    authSummary: `Next: ${introDisplay} for ${INTRO_DAYS} days, then ${annualDisplay}/year. Cancel anytime.`,
    conversionValue: INTRO_CENTS / 100,
  },
  monthly: {
    cents: MONTHLY_CENTS,
    display: monthlyDisplay,
    cardPrice: `${monthlyDisplay} / mo`,
    cta: `Choose monthly for ${monthlyDisplay}`,
    finePrint: `You'll be charged ${monthlyDisplay} today. Renews monthly.`,
    authSummary: `Next: ${monthlyDisplay}/month. Cancel anytime.`,
    conversionValue: MONTHLY_CENTS / 100,
  },
  sale: {
    cents: SALE_CENTS,
    display: saleDisplay,
    perMonthDisplay: salePerMonthDisplay,
    cardPrice: `${saleDisplay} / yr (${salePerMonthDisplay} / mo)`,
    sublabel: "LIMITED TIME · lock in this price",
    savePercent: saleSavePercent,
    badge: `Save ${saleSavePercent}%`,
    cta: `Lock in ${saleDisplay}/year`,
    finePrint: `You'll be charged ${saleDisplay} today. Renews yearly at ${saleDisplay} — your price is locked.`,
    authSummary: `Next: ${saleDisplay}/year. Cancel anytime.`,
    conversionValue: SALE_CENTS / 100,
  },
} as const;

export function pricingV2Enabled(envValue: string | null | undefined) {
  return envValue === "v1";
}

export function saleWindowOpen(now: Date | number, envValue: string | null | undefined) {
  const nowTime = now instanceof Date ? now.getTime() : now;
  if (!Number.isFinite(nowTime)) return false;

  const configuredEnd = envValue?.trim();
  if (!configuredEnd) return false;

  const endTime = Date.parse(configuredEnd);
  return Number.isFinite(endTime) && endTime > nowTime;
}

export function pricingV2AuthSummary(billing: PricingV2Billing) {
  return PRICING_V2[billing].authSummary;
}
