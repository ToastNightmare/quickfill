"use client";

import { useUser } from "@clerk/nextjs";
import { useEffect, useState, useCallback, FormEvent } from "react";
import Link from "next/link";
import { Save, ArrowLeft, PenTool, Search, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { SignatureModal } from "@/components/SignatureModal";
import { useRouter } from "next/navigation";

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
  // Australian-specific fields
  dateOfBirth?: string;
  gender?: string;
  tfn?: string;
  medicareNumber?: string;
  medicareExpiry?: string;
  driversLicence?: string;
  driversLicenceExpiry?: string;
  passportNumber?: string;
  employer?: string;
  jobTitle?: string;
  bankBsb?: string;
  bankAccount?: string;
  bankName?: string;
  [key: string]: string | undefined;
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
  dateOfBirth: "",
  gender: "",
  tfn: "",
  medicareNumber: "",
  medicareExpiry: "",
  driversLicence: "",
  driversLicenceExpiry: "",
  passportNumber: "",
  employer: "",
  jobTitle: "",
  bankBsb: "",
  bankAccount: "",
  bankName: "",
};

export default function ProfilePage() {
  useEffect(() => {
    document.title = "Profile | QuickFill";
  }, []);

  const { user } = useUser();
  const [profile, setProfile] = useState<ProfileData>(emptyProfile);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [signatureModalOpen, setSignatureModalOpen] = useState(false);
  const [abnLookupLoading, setAbnLookupLoading] = useState(false);
  const [abnLookupResult, setAbnLookupResult] = useState<{ success: boolean; businessName?: string; error?: string } | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/profile").then((r) => r.json()),
      fetch("/api/signature").then((r) => r.json()),
    ])
      .then(([profileData, sigData]) => {
        if (profileData && profileData.fullName !== undefined) {
          setProfile((prev) => ({ ...prev, ...profileData }));
        }
        if (sigData && sigData.signatureDataUrl) {
          setSignatureDataUrl(sigData.signatureDataUrl);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSignatureSave = useCallback(async (dataUrl: string) => {
    const res = await fetch("/api/signature", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ signatureDataUrl: dataUrl }),
    });
    if (res.ok) {
      setSignatureDataUrl(dataUrl);
      setSignatureModalOpen(false);
    }
  }, []);

  const handleSignatureDelete = useCallback(async () => {
    const res = await fetch("/api/signature", { method: "DELETE" });
    if (res.ok) {
      setSignatureDataUrl(null);
      setSignatureModalOpen(false);
    }
  }, []);

  const handleAbnLookup = async () => {
    const cleanAbn = profile.abn.replace(/\s/g, "");
    if (cleanAbn.length !== 11 || !/^\d{11}$/.test(cleanAbn)) {
      setAbnLookupResult({ success: false, error: "Invalid ABN format" });
      return;
    }

    setAbnLookupLoading(true);
    setAbnLookupResult(null);

    try {
      const response = await fetch(`/api/abn?abn=${cleanAbn}`);
      const data = await response.json();

      if (data && data.AbnStatus === "Active" && data.EntityName) {
        setProfile((prev) => ({ ...prev, organisation: data.EntityName }));
        setAbnLookupResult({ success: true, businessName: data.EntityName });
      } else {
        setAbnLookupResult({ success: false, error: "ABN not found or not active" });
      }
    } catch {
      setAbnLookupResult({ success: false, error: "Lookup failed" });
    } finally {
      setAbnLookupLoading(false);
    }
  };

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
        Fill this in once, QuickFill uses it to auto-fill any form instantly.
      </p>

      <form onSubmit={handleSave} className="mt-8 space-y-6">
        <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-text-muted uppercase tracking-widest">Personal Details</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Full Name" value={profile.fullName} onChange={(v) => setProfile({ ...profile, fullName: v })} placeholder="e.g. Jane Smith" />
            <Field label="Email" type="email" value={profile.email} onChange={(v) => setProfile({ ...profile, email: v })} placeholder="e.g. jane@example.com" />
            <Field label="Phone" type="tel" value={profile.phone} onChange={(v) => setProfile({ ...profile, phone: v })} placeholder="e.g. 0412 345 678" />
            <Field
              label="ABN"
              value={profile.abn}
              onChange={(v) => { setProfile({ ...profile, abn: v }); setAbnLookupResult(null); }}
              placeholder="e.g. 51 824 753 556 (optional)"
              validationHint={{
                validator: (v) => {
                  const clean = v.replace(/\s/g, "");
                  return clean.length === 11 && /^\d{11}$/.test(clean);
                },
                hint: "11 digits required",
              }}
              rightElement={
                <button
                  type="button"
                  onClick={handleAbnLookup}
                  disabled={abnLookupLoading}
                  className="border border-border rounded-lg px-3 h-11 text-sm font-medium hover:bg-surface-alt transition-colors disabled:opacity-50 flex items-center gap-1"
                >
                  {abnLookupLoading ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Lookup</>
                  ) : (
                    <><Search className="h-4 w-4" /> Lookup</>
                  )}
                </button>
              }
            />
            {abnLookupResult && (
              <div className="sm:col-span-2">
                {abnLookupResult.success ? (
                  <div className="flex items-center gap-2 text-green-600 text-sm">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Found: {abnLookupResult.businessName}</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-red-600 text-sm">
                    <XCircle className="h-4 w-4" />
                    <span>{abnLookupResult.error}</span>
                  </div>
                )}
              </div>
            )}
            <Field label="Organisation / Business Name" value={profile.organisation ?? ""} onChange={(v) => setProfile({ ...profile, organisation: v })} placeholder="e.g. Smith Bookkeeping (optional)" />
          </div>
        </div>

        <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-text-muted uppercase tracking-widest">Australian Identifiers</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Date of Birth" value={profile.dateOfBirth ?? ""} onChange={(v) => setProfile({ ...profile, dateOfBirth: v })} placeholder="DD/MM/YYYY" />
            <Field label="Gender" value={profile.gender ?? ""} onChange={(v) => setProfile({ ...profile, gender: v })} placeholder="e.g. Male / Female / Non-binary" />
            <Field
              label="Tax File Number / TFN"
              value={profile.tfn ?? ""}
              onChange={(v) => setProfile({ ...profile, tfn: v })}
              placeholder="e.g. 123 456 789"
              validationHint={{
                validator: (v) => {
                  const clean = v.replace(/\s/g, "");
                  return (clean.length === 8 || clean.length === 9) && /^\d+$/.test(clean);
                },
                hint: "8-9 digits",
              }}
            />
            <Field
              label="Medicare Number"
              value={profile.medicareNumber ?? ""}
              onChange={(v) => setProfile({ ...profile, medicareNumber: v })}
              placeholder="e.g. 1234 56789 1"
              validationHint={{
                validator: (v) => {
                  const clean = v.replace(/\s/g, "");
                  return clean.length === 11 && /^\d{10}[0-9]$/.test(clean);
                },
                hint: "10 digits + IRN",
              }}
            />
            <Field label="Medicare Expiry" value={profile.medicareExpiry ?? ""} onChange={(v) => setProfile({ ...profile, medicareExpiry: v })} placeholder="MM/YYYY" />
            <Field label="Driver Licence Number" value={profile.driversLicence ?? ""} onChange={(v) => setProfile({ ...profile, driversLicence: v })} placeholder="Optional" />
            <Field label="Driver Licence Expiry" value={profile.driversLicenceExpiry ?? ""} onChange={(v) => setProfile({ ...profile, driversLicenceExpiry: v })} placeholder="MM/YYYY" />
            <Field label="Passport Number" value={profile.passportNumber ?? ""} onChange={(v) => setProfile({ ...profile, passportNumber: v })} placeholder="Optional" />
          </div>
        </div>

        <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-text-muted uppercase tracking-widest">Employment</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Employer / Business Name" value={profile.employer ?? ""} onChange={(v) => setProfile({ ...profile, employer: v })} placeholder="e.g. Acme Corporation" />
            <Field label="Job Title" value={profile.jobTitle ?? ""} onChange={(v) => setProfile({ ...profile, jobTitle: v })} placeholder="e.g. Software Engineer" />
          </div>
        </div>

        <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-text-muted uppercase tracking-widest">Bank Details</h2>
          <p className="mt-1 text-xs text-text-muted">Stored securely. Used only for forms that ask for banking details.</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Bank Name" value={profile.bankName ?? ""} onChange={(v) => setProfile({ ...profile, bankName: v })} placeholder="e.g. Commonwealth Bank" />
            <Field label="BSB" value={profile.bankBsb ?? ""} onChange={(v) => setProfile({ ...profile, bankBsb: v })} placeholder="e.g. 062-000" />
            <div className="sm:col-span-2">
              <Field label="Account Number" value={profile.bankAccount ?? ""} onChange={(v) => setProfile({ ...profile, bankAccount: v })} placeholder="e.g. 123456789" />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-text-muted uppercase tracking-widest">Address</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field label="Address Line 1" value={profile.addressLine1 || profile.street} onChange={(v) => setProfile({ ...profile, addressLine1: v, street: v })} placeholder="e.g. 42 Wallaby Way" />
            </div>
            <div className="sm:col-span-2">
              <Field label="Address Line 2" value={profile.addressLine2} onChange={(v) => setProfile({ ...profile, addressLine2: v })} placeholder="e.g. Unit 3 (optional)" />
            </div>
            <Field label="City / Suburb" value={profile.city} onChange={(v) => setProfile({ ...profile, city: v })} placeholder="e.g. Sydney" />
            <Field label="State / Territory" value={profile.state} onChange={(v) => setProfile({ ...profile, state: v })} placeholder="e.g. NSW" />
            <Field label="Postcode" value={profile.postcode} onChange={(v) => setProfile({ ...profile, postcode: v })} placeholder="e.g. 2000" />
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

      {/* Saved Signature Section */}
      <div className="mt-8 rounded-xl border border-border bg-surface p-6 shadow-sm">
        <div className="flex items-center gap-2">
          <PenTool className="h-4 w-4 text-accent" />
          <h2 className="text-sm font-semibold text-text-muted uppercase tracking-widest">
            Saved Signature
          </h2>
        </div>
        <p className="mt-2 text-sm text-text-muted">
          Draw your signature once and reuse it across all your PDFs.
        </p>

        {signatureDataUrl ? (
          <div className="mt-4 flex flex-col gap-3">
            <div className="flex items-center justify-center rounded-lg border border-border bg-surface-alt p-4">
              <img
                src={signatureDataUrl}
                alt="Your saved signature"
                className="max-h-[80px] max-w-full object-contain"
                draggable={false}
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSignatureModalOpen(true)}
                className="flex h-10 flex-1 items-center justify-center gap-2 rounded-lg border border-border text-sm font-medium text-text hover:bg-surface-alt transition-colors"
              >
                Replace
              </button>
              <button
                type="button"
                onClick={handleSignatureDelete}
                className="flex h-10 items-center justify-center gap-2 rounded-lg border border-red-200 px-4 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setSignatureModalOpen(true)}
            className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border text-sm font-medium text-text-muted hover:border-accent hover:text-accent transition-colors"
          >
            <PenTool className="h-4 w-4" />
            Draw Your Signature
          </button>
        )}
      </div>

      <SignatureModal
        open={signatureModalOpen}
        onClose={() => setSignatureModalOpen(false)}
        onSave={handleSignatureSave}
        onDelete={signatureDataUrl ? handleSignatureDelete : undefined}
        existingSignature={signatureDataUrl}
      />
    </div>
  );
}

function ValidationHint({ value, validator, hint }: { value: string; validator: (v: string) => boolean; hint: string }) {
  const clean = value.replace(/\s/g, "");
  if (!clean) return null;
  const valid = validator(clean);
  return (
    <span className={`text-xs mt-0.5 ${valid ? "text-green-600" : "text-text-muted"}`}>
      {valid ? <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Valid</span> : hint}
    </span>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  validationHint,
  rightElement,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  validationHint?: { validator: (v: string) => boolean; hint: string };
  rightElement?: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-text-muted">{label}</span>
      <div className="flex gap-2">
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="h-11 flex-1 rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
        />
        {rightElement}
      </div>
      {validationHint && <ValidationHint value={value} validator={validationHint.validator} hint={validationHint.hint} />}
    </label>
  );
}
