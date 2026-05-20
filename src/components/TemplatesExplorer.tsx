"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Building2, Clock, FileText, Layers, MessageSquare, Search, Upload, X } from "lucide-react";
import type { TemplateDirectoryItem } from "@/lib/template-directory";

const filters = [
  { label: "All", value: "all" },
  { label: "Popular", value: "popular" },
  { label: "ATO", value: "ATO" },
  { label: "Employment", value: "Employment" },
  { label: "Super", value: "Superannuation" },
  { label: "Centrelink", value: "Centrelink" },
  { label: "Business", value: "Business" },
  { label: "State forms", value: "state" },
  { label: "NDIS", value: "NDIS" },
] as const;

type FilterValue = (typeof filters)[number]["value"];

function normalize(value: string) {
  return value.toLowerCase().trim();
}

function matchesFilter(template: TemplateDirectoryItem, activeFilter: FilterValue) {
  if (activeFilter === "all") return true;
  if (activeFilter === "popular") return Boolean(template.popular);
  if (activeFilter === "state") return template.tags.includes("state form") || template.category === "Real Estate";
  return template.category === activeFilter;
}

function PdfPreview({ template }: { template: TemplateDirectoryItem }) {
  const src = `/templates/${template.file}#page=1&view=FitH&toolbar=0&navpanes=0&scrollbar=0`;

  return (
    <div className="relative h-40 overflow-hidden border-b border-border bg-surface-alt">
      <object
        aria-label={`${template.title} preview`}
        className="h-full w-full pointer-events-none"
        data={src}
        type="application/pdf"
      >
        <div className="flex h-full items-center justify-center">
          <FileText className="h-10 w-10 text-accent" />
        </div>
      </object>
      <div className="absolute left-3 top-3 flex flex-wrap gap-2">
        {template.popular && (
          <span className="rounded-full bg-emerald-500 px-2.5 py-1 text-xs font-semibold text-white shadow-sm">
            Popular
          </span>
        )}
        {template.badge && (
          <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-accent shadow-sm">
            {template.badge}
          </span>
        )}
      </div>
    </div>
  );
}

function TemplateCard({ template }: { template: TemplateDirectoryItem }) {
  return (
    <article className="flex h-full flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <PdfPreview template={template} />
      <div className="flex flex-1 flex-col p-5">
        <div className="mb-3 flex items-center justify-between gap-3 text-xs font-semibold text-text-muted">
          <span>{template.category}</span>
          <span>{template.pageCount} pages</span>
        </div>

        <h3 className="text-lg font-semibold text-text">
          {template.slug ? (
            <Link href={`/templates/${template.slug}`} className="hover:text-accent">
              {template.title}
            </Link>
          ) : (
            template.title
          )}
        </h3>

        <p className="mt-2 text-sm leading-6 text-text-muted">{template.description}</p>
        <p className="mt-3 text-sm leading-6 text-text">
          <span className="font-semibold">Used for:</span> {template.commonUse}.
        </p>

        <div className="mt-4 grid gap-2 text-xs text-text-muted sm:grid-cols-3">
          <span className="flex items-center gap-1.5">
            <Building2 className="h-3.5 w-3.5 text-accent" />
            {template.agency}
          </span>
          <span className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-accent" />
            {template.estimatedTime}
          </span>
          <span className="flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5 text-accent" />
            PDF form
          </span>
        </div>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <Link
            href={`/editor?template=${encodeURIComponent(template.file)}`}
            className="flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
          >
            <FileText className="h-4 w-4" />
            Fill form
          </Link>
          {template.slug && (
            <Link
              href={`/templates/${template.slug}`}
              className="flex h-10 items-center justify-center rounded-lg border border-border px-4 text-sm font-semibold text-text transition-colors hover:border-accent hover:text-accent"
            >
              Details
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}

export function TemplatesExplorer({ templates }: { templates: TemplateDirectoryItem[] }) {
  const [query, setQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<FilterValue>("all");

  const normalizedQuery = normalize(query);
  const filteredTemplates = useMemo(() => {
    return templates
      .filter((template) => {
        if (!matchesFilter(template, activeFilter)) return false;
        if (!normalizedQuery) return true;

        const searchableText = normalize(
          [
            template.title,
            template.description,
            template.category,
            template.agency,
            template.commonUse,
            template.file,
            ...template.tags,
          ].join(" "),
        );

        return searchableText.includes(normalizedQuery);
      })
      .sort((a, b) => {
        if (a.popular && !b.popular) return -1;
        if (!a.popular && b.popular) return 1;
        return a.title.localeCompare(b.title);
      });
  }, [activeFilter, normalizedQuery, templates]);

  const hasActiveSearch = Boolean(normalizedQuery) || activeFilter !== "all";

  return (
    <section className="mt-10" aria-labelledby="template-explorer-title">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 flex-1">
          <h2 id="template-explorer-title" className="text-xl font-bold text-text">
            Find a template
          </h2>
          <label className="mt-3 block max-w-2xl">
            <span className="sr-only">Search forms by name, agency or task</span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="h-12 w-full rounded-lg border border-border bg-surface pl-11 pr-11 text-base outline-none transition-colors placeholder:text-text-muted focus:border-accent focus:ring-2 focus:ring-accent/20"
                placeholder="Search forms, agencies or tasks"
                type="search"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-surface-alt hover:text-text"
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </label>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row lg:justify-end">
          <Link
            href="/editor"
            className="flex h-11 items-center justify-center gap-2 rounded-lg bg-accent px-5 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
          >
            <Upload className="h-4 w-4" />
            Upload your PDF
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

      <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
        {filters.map((filter) => {
          const isActive = activeFilter === filter.value;
          return (
            <button
              key={filter.value}
              type="button"
              onClick={() => setActiveFilter(filter.value)}
              className={
                "h-9 shrink-0 rounded-full border px-4 text-sm font-semibold transition-colors " +
                (isActive
                  ? "border-accent bg-accent text-white"
                  : "border-border bg-surface text-text-muted hover:border-accent hover:text-accent")
              }
            >
              {filter.label}
            </button>
          );
        })}
      </div>

      <div className="mt-5 flex flex-col gap-2 border-y border-border py-4 text-sm text-text-muted sm:flex-row sm:items-center sm:justify-between">
        <p>
          {filteredTemplates.length} of {templates.length} templates shown
        </p>
        {hasActiveSearch && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setActiveFilter("all");
            }}
            className="w-fit font-semibold text-accent hover:text-accent-hover"
          >
            Show all templates
          </button>
        )}
      </div>

      {filteredTemplates.length > 0 ? (
        <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {filteredTemplates.map((template) => (
            <TemplateCard key={template.file} template={template} />
          ))}
        </div>
      ) : (
        <div className="mt-6 rounded-lg border border-border bg-surface p-8 text-center">
          <h3 className="text-lg font-semibold text-text">No matching templates</h3>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-text-muted">
            Upload your own PDF or send a template request through support.
          </p>
          <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
            <Link
              href="/editor"
              className="flex h-10 items-center justify-center rounded-lg bg-accent px-5 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
            >
              Upload PDF
            </Link>
            <Link
              href="/support?topic=templates"
              className="flex h-10 items-center justify-center rounded-lg border border-border px-5 text-sm font-semibold text-text transition-colors hover:border-accent hover:text-accent"
            >
              Request template
            </Link>
          </div>
        </div>
      )}
    </section>
  );
}
