import { clerkClient } from "@clerk/nextjs/server";
import type Stripe from "stripe";
import { getRedis } from "@/lib/redis";
import { getStripe } from "@/lib/stripe";
import { getDownloadLogs, getSupportMessages } from "@/lib/admin-logs";

type ClerkUser = Awaited<ReturnType<Awaited<ReturnType<typeof clerkClient>>["users"]["getUser"]>>;

export interface AdminUserSummary {
  id: string;
  name: string;
  email: string;
  imageUrl: string;
  createdAt: string;
  lastSignInAt: string | null;
  lastActiveAt: string | null;
  banned: boolean;
  locked: boolean;
  twoFactorEnabled: boolean;
  tier: string;
  usedThisMonth: number;
  recentFillCount: number;
  stripeCustomerId: string | null;
}

export interface AdminCustomerDetail extends AdminUserSummary {
  safeProfile: {
    fullName?: string;
    email?: string;
    phone?: string;
    city?: string;
    state?: string;
    postcode?: string;
    country?: string;
    organisation?: string;
  };
  hasSensitiveProfileData: boolean;
  fills: {
    filename: string;
    filledAt: string;
    fieldCount: number;
    pageCount: number;
  }[];
  stripeCustomer: {
    id: string;
    email: string | null;
    name: string | null;
    createdAt: string | null;
    delinquent: boolean | null;
  } | null;
  subscriptions: {
    id: string;
    status: string;
    currentPeriodEnd: string | null;
    price: string;
    amount: number;
    interval: string;
  }[];
}

export interface AdminRevenueSummary {
  activeSubscriptions: number;
  trialingSubscriptions: number;
  pastDueSubscriptions: number;
  canceledSubscriptions: number;
  monthlyRunRateCents: number;
  last30InvoiceCents: number;
  recentInvoices: {
    id: string;
    email: string | null;
    amountPaid: number;
    status: string | null;
    createdAt: string;
    hostedInvoiceUrl: string | null;
  }[];
  recentSubscriptions: {
    id: string;
    customer: string;
    status: string;
    createdAt: string;
    amount: number;
    interval: string;
  }[];
}

function monthKey(userId: string) {
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  return `usage:${userId}:${month}`;
}

function iso(value: number | null | undefined) {
  if (!value) return null;
  return new Date(value).toISOString();
}

function primaryEmail(user: ClerkUser) {
  return user.primaryEmailAddress?.emailAddress ?? user.emailAddresses?.find((item) => item.emailAddress)?.emailAddress ?? "";
}

function displayName(user: ClerkUser) {
  return [user.firstName, user.lastName].filter(Boolean).join(" ") || primaryEmail(user) || "Unnamed user";
}

function toNumber(value: unknown) {
  const next = Number(value ?? 0);
  return Number.isFinite(next) ? next : 0;
}

async function summarizeUser(user: ClerkUser): Promise<AdminUserSummary> {
  const redis = getRedis();
  const [tier, used, fills, stripeCustomerId] = await Promise.all([
    redis.get<string>(`sub:${user.id}`),
    redis.get<number>(monthKey(user.id)),
    redis.lrange<{ filename: string; filledAt: string; fieldCount: number; pageCount: number }>(`fills:${user.id}`, 0, 2),
    redis.get<string>(`stripe_customer:${user.id}`),
  ]);

  return {
    id: user.id,
    name: displayName(user),
    email: primaryEmail(user),
    imageUrl: user.imageUrl,
    createdAt: new Date(user.createdAt).toISOString(),
    lastSignInAt: iso(user.lastSignInAt),
    lastActiveAt: iso(user.lastActiveAt),
    banned: user.banned,
    locked: user.locked,
    twoFactorEnabled: user.twoFactorEnabled,
    tier: tier ?? "free",
    usedThisMonth: used ?? 0,
    recentFillCount: fills?.length ?? 0,
    stripeCustomerId: stripeCustomerId ?? null,
  };
}

export async function getAdminUsers(query = "") {
  const client = await clerkClient();
  const cleanQuery = query.trim();
  const [users, totalCount] = await Promise.all([
    client.users.getUserList({
      limit: 25,
      orderBy: "-created_at",
      ...(cleanQuery ? { query: cleanQuery } : {}),
    }),
    client.users.getCount(cleanQuery ? { query: cleanQuery } : undefined),
  ]);

  return {
    totalCount,
    users: await Promise.all(users.data.map((user) => summarizeUser(user))),
  };
}

function hasSensitiveProfileData(profile: Record<string, unknown> | null) {
  if (!profile) return false;
  return Boolean(
    profile.tfn ||
      profile.medicareNumber ||
      profile.driversLicence ||
      profile.passportNumber ||
      profile.bankBsb ||
      profile.bankAccount
  );
}

function safeProfile(profile: Record<string, unknown> | null) {
  if (!profile) return {};
  const allowed = ["fullName", "email", "phone", "city", "state", "postcode", "country", "organisation"] as const;
  return Object.fromEntries(
    allowed
      .map((key) => [key, typeof profile[key] === "string" ? profile[key] : undefined])
      .filter(([, value]) => value)
  );
}

function stripeAmount(subscription: Stripe.Subscription) {
  const item = subscription.items.data[0];
  return item?.price?.unit_amount ?? 0;
}

function stripeInterval(subscription: Stripe.Subscription) {
  return subscription.items.data[0]?.price?.recurring?.interval ?? "month";
}

export async function getAdminCustomer(userId: string): Promise<AdminCustomerDetail> {
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const summary = await summarizeUser(user);
  const redis = getRedis();
  const [profileRaw, fills, stripeCustomerId] = await Promise.all([
    redis.get<Record<string, unknown>>(`profile:${userId}`),
    redis.lrange<{ filename: string; filledAt: string; fieldCount: number; pageCount: number }>(`fills:${userId}`, 0, 29),
    redis.get<string>(`stripe_customer:${userId}`),
  ]);

  let stripeCustomer: AdminCustomerDetail["stripeCustomer"] = null;
  let subscriptions: AdminCustomerDetail["subscriptions"] = [];

  if (stripeCustomerId) {
    try {
      const stripe = getStripe();
      const [customer, subList] = await Promise.all([
        stripe.customers.retrieve(stripeCustomerId),
        stripe.subscriptions.list({ customer: stripeCustomerId, status: "all", limit: 10 }),
      ]);

      if (!customer.deleted) {
        stripeCustomer = {
          id: customer.id,
          email: customer.email ?? null,
          name: customer.name ?? null,
          createdAt: customer.created ? new Date(customer.created * 1000).toISOString() : null,
          delinquent: customer.delinquent ?? null,
        };
      }

      subscriptions = subList.data.map((subscription) => ({
        id: subscription.id,
        status: subscription.status,
        currentPeriodEnd: subscription.items.data[0]?.current_period_end ? new Date(subscription.items.data[0].current_period_end * 1000).toISOString() : null,
        price: subscription.items.data[0]?.price?.nickname ?? subscription.items.data[0]?.price?.id ?? "Unknown price",
        amount: stripeAmount(subscription),
        interval: stripeInterval(subscription),
      }));
    } catch {
      stripeCustomer = null;
      subscriptions = [];
    }
  }

  return {
    ...summary,
    safeProfile: safeProfile(profileRaw),
    hasSensitiveProfileData: hasSensitiveProfileData(profileRaw),
    fills: fills ?? [],
    stripeCustomer,
    subscriptions,
  };
}

export async function getAdminSupportInbox() {
  return getSupportMessages(100);
}

export async function getAdminFailureLogs() {
  const logs = await getDownloadLogs(120);
  return logs.filter((log) => log.status !== "success");
}

export async function getAdminRevenueSummary(): Promise<AdminRevenueSummary> {
  const stripe = getStripe();
  const [subscriptions, invoices] = await Promise.all([
    stripe.subscriptions.list({ status: "all", limit: 100 }),
    stripe.invoices.list({ limit: 100 }),
  ]);

  const activeLike = subscriptions.data.filter((sub) => ["active", "trialing", "past_due"].includes(sub.status));
  const monthlyRunRateCents = activeLike.reduce((total, sub) => {
    const amount = stripeAmount(sub);
    const interval = stripeInterval(sub);
    return total + (interval === "year" ? Math.round(amount / 12) : amount);
  }, 0);

  const since = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const last30InvoiceCents = invoices.data
    .filter((invoice) => invoice.status === "paid" && invoice.created * 1000 >= since)
    .reduce((total, invoice) => total + toNumber(invoice.amount_paid), 0);

  return {
    activeSubscriptions: subscriptions.data.filter((sub) => sub.status === "active").length,
    trialingSubscriptions: subscriptions.data.filter((sub) => sub.status === "trialing").length,
    pastDueSubscriptions: subscriptions.data.filter((sub) => sub.status === "past_due").length,
    canceledSubscriptions: subscriptions.data.filter((sub) => sub.status === "canceled").length,
    monthlyRunRateCents,
    last30InvoiceCents,
    recentInvoices: invoices.data.slice(0, 12).map((invoice) => ({
      id: invoice.id ?? "invoice",
      email: invoice.customer_email ?? null,
      amountPaid: invoice.amount_paid,
      status: invoice.status,
      createdAt: new Date(invoice.created * 1000).toISOString(),
      hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
    })),
    recentSubscriptions: subscriptions.data.slice(0, 12).map((subscription) => ({
      id: subscription.id,
      customer: typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id,
      status: subscription.status,
      createdAt: new Date(subscription.created * 1000).toISOString(),
      amount: stripeAmount(subscription),
      interval: stripeInterval(subscription),
    })),
  };
}
