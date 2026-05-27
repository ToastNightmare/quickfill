import type { Metadata } from "next";
import Script from "next/script";

export const metadata: Metadata = {
  title: "QuickFill Blog and Resources | QuickFill",
  description:
    "Read QuickFill resources for practical tips on filling PDF forms online. General information only, with no government affiliation or professional advice.",
  alternates: {
    canonical: "/blog",
  },
  openGraph: {
    title: "QuickFill Blog and Resources",
    description:
      "Practical QuickFill resources for filling PDF forms online. General information only.",
    url: "/blog",
    siteName: "QuickFill",
    type: "website",
    locale: "en_AU",
  },
};

export default function BlogPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
      <section className="max-w-3xl">
        <span className="inline-flex items-center rounded-full bg-accent/10 px-4 py-1.5 text-sm font-semibold text-accent">
          Resources
        </span>
        <h1 className="mt-4 text-3xl font-bold text-text sm:text-4xl">QuickFill Blog</h1>
        <p className="mt-4 text-base leading-7 text-text-muted">
          Helpful articles and resources for working with PDF forms online.
        </p>
      </section>

      <div className="mt-8 rounded-lg border border-border bg-surface-alt p-4 text-sm leading-6 text-text-muted">
        QuickFill articles are general information only. QuickFill is not government-affiliated and
        does not provide legal, tax, medical, Centrelink, immigration, tenancy, or financial advice.
      </div>

      <section className="mt-10 min-h-[360px]" aria-label="QuickFill blog articles">
        <div id="soro-blog" />
      </section>

      <Script
        src="https://app.trysoro.com/api/embed/dea996a6-6159-4216-8d8b-d8c5b698b63d"
        strategy="afterInteractive"
      />
    </div>
  );
}
