"use client";

import { useUser } from "@clerk/nextjs";
import { useEffect, useState, FormEvent } from "react";
import Link from "next/link";
import { Save, ArrowLeft } from "lucide-react";

interface ProfileData {
  fullName: string;
  email: string;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postcode: string;
  country: string;
  abn: string;
  street: string;
  organisation: string;
}

const emptyProfile: ProfileData = {
  fullName: "",
  email: "",
  phone: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  state: "",
  postcode: "",
  country: "",
  abn: "",
  street: "",
  organisation: "",
};

export default function ProfilePage() {
  const { user } = useUser();
  const [profile, setProfile] = useState<ProfileData>(emptyProfile);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then((data) => {
        if (data && data.fullName !== undefined) {
          setProfile((prev) => ({ ...prev, ...data }));
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    // Map addressLine1 to street for backward compat
    const payload = {
      ...profile,
      street: profile.addressLine1 || profile.street,
    };
    await fetch("/api/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 lg:px-8">
      <Link
        href="/dashboard"
        className="mb-6 inline-flex items-center gap-1 text-sm text-text-muted hover:text-text transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Dashboard
      </Link>

      <h1 className="text-2xl font-bold sm:text-3xl">Auto-fill Profile</h1>
      <p className="mt-2 text-text-muted">
        Save your details here. When you click &quot;Auto-fill from Profile&quot; in the editor,
        we&apos;ll match these to PDF form fields automatically.
      </p>

      <form onSubmit={handleSave} className="mt-8 space-y-6">
        <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-text-muted uppercase tracking-widest">Personal Details</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Full Name" value={profile.fullName} onChange={(v) => setProfile({ ...profile, fullName: v })} />
            <Field label="Email" type="email" value={profile.email} onChange={(v) => setProfile({ ...profile, email: v })} />
            <Field label="Phone" type="tel" value={profile.phone} onChange={(v) => setProfile({ ...profile, phone: v })} />
            <Field label="ABN" value={profile.abn} onChange={(v) => setProfile({ ...profile, abn: v })} placeholder="Optional" />
          </div>
        </div>

        <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-text-muted uppercase tracking-widest">Address</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field label="Address Line 1" value={profile.addressLine1 || profile.street} onChange={(v) => setProfile({ ...profile, addressLine1: v, street: v })} />
            </div>
            <div className="sm:col-span-2">
              <Field label="Address Line 2" value={profile.addressLine2} onChange={(v) => setProfile({ ...profile, addressLine2: v })} placeholder="Optional" />
            </div>
            <Field label="City / Suburb" value={profile.city} onChange={(v) => setProfile({ ...profile, city: v })} />
            <Field label="State / Territory" value={profile.state} onChange={(v) => setProfile({ ...profile, state: v })} />
            <Field label="Postcode" value={profile.postcode} onChange={(v) => setProfile({ ...profile, postcode: v })} />
            <Field label="Country" value={profile.country} onChange={(v) => setProfile({ ...profile, country: v })} placeholder="e.g. Australia" />
          </div>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent text-sm font-semibold text-white hover:bg-accent-hover transition-colors disabled:opacity-50 sm:w-auto sm:px-8"
        >
          <Save className="h-4 w-4" />
          {saving ? "Saving..." : saved ? "Saved!" : "Save Profile"}
        </button>
      </form>
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
