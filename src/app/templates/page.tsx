import type { Metadata } from "next";
import Link from "next/link";
import { FileText, MessageSquare, ShieldCheck, Upload } from "lucide-react";
import { TemplatesExplorer } from "@/components/TemplatesExplorer";
import { templateCount, templateDirectory } from "@/lib/template-directory";

export const metadata: Metadata = {
  title: "Australian PDF Form Templates | QuickFill",
  description:
    "Search and fill common Australian PDF form templates online, including ATO, Centrelink, employment, rental, NDIS, invoice, and consent forms.",
  alternates: {
    canonical: "/templates",
  },
};

export default function TemplatesPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
      <section className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(260px,360px)] lg:items-end">
        <div>
          <span className="inline-flex items-center rounded-full bg-accent/10 px-4 py-1.5 text-sm font-semibold text-accent">
            Australian forms
          </span>
          <h1 className="mt-4 text-3xl font-bold text-text sm:text-4xl">Form Templates</h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-text-muted">
            Pick a ready template, upload your own PDF, fill it online, and download the finished form.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/editor"
              className="flex h-11 items-center justify-center gap-2 rounded-lg bg-accent px-5 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
            >
              <Upload className="h-4 w-4" />
              Upload your own PDF
            </Link>
            <Link
              href="/support?topic=templates"
              className="flex h-11 items-center justify-center gap-2 rounded-lg border border-border px-5 text-sm font-semibold text-text transition-colors hover:border-accent hover:text-accent"
            >
              <MessageSquare className="h-4 w-4" />
              Request a template
            </Link>
          </div>
        </div>

        <div className="border-l-4 border-accent pl-5">
          <p className="text-4xl font-bold text-text">{templateCount}</p>
          <p className="mt-2 text-sm leading-6 text-text-muted">
            Ready templates across tax, employment, Centrelink, rental, business, NDIS, health and consent forms.
          </p>
        </div>
      </section>

      <div className="mt-8 grid gap-4 border-y border-border py-5 md:grid-cols-3">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
          <p className="text-sm leading-6 text-text-muted">
            Independent from the ATO, Services Australia, NDIS and state agencies.
          </p>
        </div>
        <div className="flex items-start gap-3">
          <FileText className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
          <p className="text-sm leading-6 text-text-muted">
            Public forms and practical Australian templates in one searchable place.
          </p>
        </div>
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
          <p className="text-sm leading-6 text-text-muted">
            PDFs are processed for download generation and are not stored on QuickFill servers.
          </p>
        </div>
      </div>

      <TemplatesExplorer templates={templateDirectory} />

      <section className="mt-12 border-t border-border pt-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-bold text-text">Can’t find the form?</h2>
            <p className="mt-2 text-sm leading-6 text-text-muted">
              Send the form name or agency through support and it can be reviewed for the template library.
            </p>
          </div>
          <Link
            href="/support?topic=templates"
            className="flex h-11 items-center justify-center gap-2 rounded-lg bg-accent px-5 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
          >
            <MessageSquare className="h-4 w-4" />
            Request a template
          </Link>
        </div>
      </section>
    </div>
  );
}
