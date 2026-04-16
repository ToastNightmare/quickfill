import Link from "next/link";
import { notFound } from "next/navigation";
import { getTemplateBySlug, getRelatedTemplates } from "@/lib/templates-config";
import { FileText, ArrowRight, CheckCircle, XCircle, HelpCircle } from "lucide-react";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  const template = getTemplateBySlug(slug);
  
  if (!template) {
    return {
      title: "Template Not Found | QuickFill",
      description: "The requested template could not be found.",
    };
  }

  return {
    title: template.seoTitle,
    description: template.seoDescription,
    alternates: {
      canonical: `${process.env.NEXT_PUBLIC_APP_URL || "https://getquickfill.com"}/templates/${slug}`,
    },
  };
}

export async function generateStaticParams() {
  const { getTemplateSlugs } = await import("@/lib/templates-config");
  const slugs = getTemplateSlugs();
  
  return slugs.map((slug) => ({
    slug,
  }));
}

export default async function TemplatePage({ params }: PageProps) {
  const { slug } = await params;
  const template = getTemplateBySlug(slug);
  
  if (!template) {
    notFound();
  }

  const relatedTemplates = getRelatedTemplates(slug, 3);

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
      {/* Hero Section */}
      <div className="text-center mb-12">
        <div className="text-6xl mb-4">{template.emoji}</div>
        <h1 className="text-4xl font-bold tracking-tight mb-4">{template.title}</h1>
        <p className="text-xl text-text-muted mb-8 max-w-2xl mx-auto">{template.description}</p>
        <Link
          href={`/editor?template=${encodeURIComponent(template.file)}`}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-accent px-8 text-base font-semibold text-white hover:bg-accent-hover transition-colors"
        >
          <FileText className="h-5 w-5" />
          Fill This Form Free
        </Link>
      </div>

      {/* What is this form? */}
      <div className="bg-surface rounded-xl p-8 mb-8 border border-border">
        <h2 className="text-2xl font-bold mb-4">What is this form?</h2>
        <p className="text-text-muted leading-relaxed">{template.whatIsThis}</p>
      </div>

      {/* Who needs this form? */}
      <div className="bg-surface rounded-xl p-8 mb-8 border border-border">
        <h2 className="text-2xl font-bold mb-4">Who needs this form?</h2>
        <p className="text-text-muted leading-relaxed">{template.whoNeedsThis}</p>
      </div>

      {/* Tips for filling it out */}
      <div className="bg-surface rounded-xl p-8 mb-8 border border-border">
        <h2 className="text-2xl font-bold mb-6">Tips for filling it out</h2>
        <ul className="space-y-4">
          {template.howToComplete.map((tip, index) => (
            <li key={index} className="flex items-start gap-3">
              <CheckCircle className="h-6 w-6 text-accent flex-shrink-0 mt-0.5" />
              <span className="text-text-muted leading-relaxed">{tip}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Common mistakes to avoid */}
      <div className="bg-surface rounded-xl p-8 mb-8 border border-border">
        <h2 className="text-2xl font-bold mb-6">Common mistakes to avoid</h2>
        <ul className="space-y-4">
          {template.commonMistakes.map((mistake, index) => (
            <li key={index} className="flex items-start gap-3">
              <XCircle className="h-6 w-6 text-red-500 flex-shrink-0 mt-0.5" />
              <span className="text-text-muted leading-relaxed">{mistake}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* FAQ Section */}
      <div className="bg-surface rounded-xl p-8 mb-12 border border-border">
        <h2 className="text-2xl font-bold mb-6">Frequently asked questions</h2>
        <div className="space-y-6">
          {template.faqs.map((faq, index) => (
            <div key={index} className="border-b border-border last:border-0 pb-6 last:pb-0">
              <h3 className="text-lg font-semibold mb-2 flex items-start gap-2">
                <HelpCircle className="h-5 w-5 text-accent flex-shrink-0 mt-0.5" />
                {faq.q}
              </h3>
              <p className="text-text-muted leading-relaxed ml-7">{faq.a}</p>
            </div>
          ))}
        </div>
      </div>

      {/* How to fill it with QuickFill */}
      <div className="mb-12">
        <h2 className="text-2xl font-bold mb-6 text-center">How to fill it with QuickFill</h2>
        <div className="grid md:grid-cols-3 gap-6">
          <div className="bg-surface rounded-xl p-6 border border-border text-center">
            <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center mx-auto mb-4">
              <span className="text-xl font-bold text-accent">1</span>
            </div>
            <h3 className="font-semibold mb-2">Upload</h3>
            <p className="text-sm text-text-muted">Open the form in our online editor. No upload needed - it&apos;s ready to go!</p>
          </div>
          <div className="bg-surface rounded-xl p-6 border border-border text-center">
            <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center mx-auto mb-4">
              <span className="text-xl font-bold text-accent">2</span>
            </div>
            <h3 className="font-semibold mb-2">Fill</h3>
            <p className="text-sm text-text-muted">Click any field to type. Your profile auto-fills common fields like name and address.</p>
          </div>
          <div className="bg-surface rounded-xl p-6 border border-border text-center">
            <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center mx-auto mb-4">
              <span className="text-xl font-bold text-accent">3</span>
            </div>
            <h3 className="font-semibold mb-2">Download</h3>
            <p className="text-sm text-text-muted">Download your completed PDF instantly. Pro users get unlimited downloads with no watermarks.</p>
          </div>
        </div>
      </div>

      {/* Related Templates */}
      {relatedTemplates.length > 0 && (
        <div>
          <h2 className="text-2xl font-bold mb-6">Related {template.category} Forms</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {relatedTemplates.map((related) => (
              <Link
                key={related.slug}
                href={`/templates/${related.slug}`}
                className="block group"
              >
                <div className="bg-surface rounded-xl p-6 border border-border hover:border-accent transition-colors">
                  <div className="text-4xl mb-3">{related.emoji}</div>
                  <h3 className="font-semibold mb-2 group-hover:text-accent transition-colors">{related.title}</h3>
                  <p className="text-sm text-text-muted mb-4">{related.description}</p>
                  <div className="inline-flex items-center gap-1 text-accent text-sm font-medium">
                    View form
                    <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
