import type { Metadata } from "next";
import Link from "next/link";
import { Bug, CreditCard, FileText, FileWarning, LifeBuoy, MessageSquare, ShieldCheck, UserCheck } from "lucide-react";
import { SupportForm } from "@/components/SupportForm";

export const metadata: Metadata = {
  title: "Support | QuickFill",
  description: "Send a support message to QuickFill for upload, editing, download, login, account, billing, and product issues.",
};

const TOPICS = {
  billing: {
    label: "Billing",
    icon: CreditCard,
    category: "billing",
    subject: "Billing question",
    body: "Payments, invoices, subscriptions, and refunds.",
  },
  pro: {
    label: "Login and account",
    icon: UserCheck,
    category: "account",
    subject: "Login and account help",
    body: "Sign in, account access, saved details, and profile help.",
  },
  pdf: {
    label: "Upload or download issue",
    icon: FileWarning,
    category: "pdf",
    subject: "Upload or download issue",
    body: "Upload problems, download problems, viewer errors, and finished document output.",
  },
  bug: {
    label: "Bug report",
    icon: Bug,
    category: "bug",
    subject: "Bug report",
    body: "Something is broken or not working as expected.",
  },
  templates: {
    label: "Template request",
    icon: FileText,
    category: "general",
    subject: "Template request",
    body: "Ask for an Australian form to be added or improved.",
  },
  general: {
    label: "General",
    icon: MessageSquare,
    category: "general",
    subject: "Support request",
    body: "Anything else you need help with.",
  },
} as const;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
type TopicKey = keyof typeof TOPICS;

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function topicFromParams(value: string | string[] | undefined): TopicKey {
  const topic = firstParam(value);
  return topic && topic in TOPICS ? (topic as TopicKey) : "general";
}

export default async function SupportPage({ searchParams }: { searchParams?: SearchParams }) {
  const params = (await searchParams) ?? {};
  const topicKey = topicFromParams(params.topic);
  const topic = TOPICS[topicKey];

  return (
    <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8">
      <section className="max-w-3xl">
        <div className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-accent/10">
          <LifeBuoy className="h-5 w-5 text-accent" />
        </div>
        <h1 className="mt-5 text-3xl font-extrabold sm:text-4xl">Support</h1>
        <p className="mt-3 text-base leading-7 text-text-muted">
          Send one support message for upload issues, editing issues, download issues, login and account help, billing, payment help, bugs, or general questions.
          If you are signed in, QuickFill attaches your account context automatically.
        </p>
      </section>

      <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-start">
        <aside className="space-y-3">
          {Object.entries(TOPICS).map(([key, item]) => {
            const Icon = item.icon;
            const active = key === topicKey;
            return (
              <Link
                key={key}
                href={`/support?topic=${key}`}
                className={
                  "flex items-start gap-3 rounded-lg border p-4 transition-colors " +
                  (active
                    ? "border-accent bg-accent/5 text-text"
                    : "border-border bg-surface text-text-muted hover:border-accent hover:text-text")
                }
              >
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-alt">
                  <Icon className="h-4 w-4 text-accent" />
                </span>
                <span>
                  <span className="block text-sm font-semibold text-text">{item.label}</span>
                  <span className="mt-1 block text-sm leading-6">{item.body}</span>
                </span>
              </Link>
            );
          })}

          <div className="rounded-lg border border-border bg-surface p-4 text-sm leading-6 text-text-muted">
            <div className="mb-2 flex items-center gap-2 font-semibold text-text">
              <ShieldCheck className="h-4 w-4 text-accent" />
              Private by default
            </div>
            Describe the problem without pasting sensitive form details. Support messages are stored for follow-up, but uploaded PDFs are not attached here.
          </div>
        </aside>

        <SupportForm
          source={`support:${topicKey}`}
          title="Message Support"
          description="Choose a category and send the details. We will use your account context to investigate faster."
          defaultCategory={topic.category}
          defaultSubject={topic.subject}
        />
      </div>
    </div>
  );
}
