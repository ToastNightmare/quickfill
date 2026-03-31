"use client";

import { useUser } from "@clerk/nextjs";
import { Suspense, useEffect, useState, FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { FileText, Sparkles, Save, ExternalLink } from "lucide-react";

interface UsageData {
  used: number;
  limit: number;
  isPro: boolean;
}

interface ProfileData {
  fullName: string;
  email: string;
  phone: string;
  street: string;
  city: string;
  state: string;
  postcode: string;
  abn: string;
  organisation: string;
}

const emptyProfile: ProfileData = {
  fullName: "",
  email: "",
  phone: "",
  street: "",
  city: "",
  state: "",
  postcode: "",
  abn: "",
  organisation: "",
};

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="flex min-h-[50vh] items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" /></div>}>
      <DashboardContent />
    </Suspense>
  );
}

function DashboardContent() {
  const { user } = useUser();
  const searchParams = useSearchParams();
  const upgraded = searchParams.get("upgraded");

  const [usage, setUsage] = useState<UsageData | null>(null);
  const [profile, setProfile] = useState<ProfileData>(emptyProfile);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/usage").then((r) => r.json()).then(setUsage);
    fetch("/api/profile").then((r) => r.json()).then((data) => {
      if (data && data.fullName !== undefined) setProfile(data);
    });
  }, []);

  const handleSaveProfile = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    await fetch("/api/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(profile),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleUpgrade = async () => {
    const res = await fetch("/api/stripe/checkout", { method: "POST" });
    const { url } = await res.json();
    if (url) window.location.href = url;
  };

  const handleManageBilling = async () => {
    const res = await fetch("/api/stripe/portal", { method: "POST" });
    const { url } = await res.json();
    if (url) window.location.href = url;
  };

  const usedPct = usage ? Math.min(100, (usage.used / usage.limit) * 100) : 0;

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
      {/* Welcome header */}
      <h1 className="text-2xl font-bold sm:text-3xl">
        Welcome back, {user?.firstName ?? "there"}
      </h1>
      <p className="mt-1 text-text-muted">Manage your profile and usage.</p>

      {upgraded && (
        <div className="mt-4 rounded-xl border border-accent/30 bg-accent/5 p-4 text-sm text-accent font-medium">
          <Sparkles className="mr-2 inline h-4 w-4" />
          You&apos;ve upgraded to Pro! Enjoy unlimited fills.
        </div>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        {/* Usage card */}
        <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Usage This Month</h2>
          {usage ? (
            <>
              <p className="mt-2 text-sm text-text-muted">
                {usage.isPro ? (
                  "Unlimited fills — Pro plan active"
                ) : (
                  <>{usage.used} of {usage.limit} free fills used</>
                )}
              </p>
              {!usage.isPro && (
                <>
                  <div className="mt-3 h-2 rounded-full bg-surface-alt overflow-hidden">
                    <div
                      className="h-full rounded-full bg-accent transition-all"
                      style={{ width: `${usedPct}%` }}
                    />
                  </div>
                  <button
                    onClick={handleUpgrade}
                    className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-accent text-sm font-semibold text-white hover:bg-accent-hover transition-colors"
                  >
                    <Sparkles className="h-4 w-4" />
                    Upgrade to Pro — $12/mo
                  </button>
                </>
              )}
              {usage.isPro && (
                <button
                  onClick={handleManageBilling}
                  className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-border text-sm font-semibold hover:bg-surface-alt transition-colors"
                >
                  <ExternalLink className="h-4 w-4" />
                  Manage Billing
                </button>
              )}
            </>
          ) : (
            <div className="mt-4 h-8 animate-pulse rounded bg-surface-alt" />
          )}
        </div>

        {/* Recent fills */}
        <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Recent Fills</h2>
          <div className="mt-6 flex flex-col items-center justify-center py-8 text-center">
            <FileText className="h-10 w-10 text-text-muted/40" />
            <p className="mt-3 text-sm text-text-muted">
              Your filled documents will appear here.
            </p>
          </div>
        </div>
      </div>

      {/* Upgrade banner for free users */}
      {usage && !usage.isPro && (
        <div className="mt-6 rounded-xl bg-navy p-6 text-white">
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-lg font-semibold">Unlock unlimited fills</h3>
              <p className="mt-1 text-sm text-gray-300">
                Upgrade to Pro for $12/month and never hit a limit.
              </p>
            </div>
            <button
              onClick={handleUpgrade}
              className="flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-accent px-6 text-sm font-semibold text-white hover:bg-accent-hover transition-colors"
            >
              <Sparkles className="h-4 w-4" />
              Upgrade Now
            </button>
          </div>
        </div>
      )}

      {/* Profile card */}
      <div className="mt-6 rounded-xl border border-border bg-surface p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Auto-fill Profile</h2>
        <p className="mt-1 text-sm text-text-muted">
          Save your details to auto-fill common PDF form fields.
        </p>

        <form onSubmit={handleSaveProfile} className="mt-6 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full Name" value={profile.fullName} onChange={(v) => setProfile({ ...profile, fullName: v })} />
            <Field label="Email" type="email" value={profile.email} onChange={(v) => setProfile({ ...profile, email: v })} />
            <Field label="Phone" type="tel" value={profile.phone} onChange={(v) => setProfile({ ...profile, phone: v })} />
            <Field label="Organisation" value={profile.organisation} onChange={(v) => setProfile({ ...profile, organisation: v })} placeholder="Optional" />
          </div>

          <h3 className="pt-2 text-sm font-semibold text-text-muted">Address</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field label="Street" value={profile.street} onChange={(v) => setProfile({ ...profile, street: v })} />
            </div>
            <Field label="City" value={profile.city} onChange={(v) => setProfile({ ...profile, city: v })} />
            <Field label="State" value={profile.state} onChange={(v) => setProfile({ ...profile, state: v })} />
            <Field label="Postcode" value={profile.postcode} onChange={(v) => setProfile({ ...profile, postcode: v })} />
            <Field label="ABN" value={profile.abn} onChange={(v) => setProfile({ ...profile, abn: v })} placeholder="Optional" />
          </div>

          <button
            type="submit"
            disabled={saving}
            className="flex h-11 items-center justify-center gap-2 rounded-xl bg-accent px-6 text-sm font-semibold text-white hover:bg-accent-hover transition-colors disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {saving ? "Saving..." : saved ? "Saved!" : "Save Profile"}
          </button>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-text-muted">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-11 rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
      />
    </label>
  );
}
