import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service | QuickFill",
  description: "Terms and conditions for using QuickFill.",
};

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
        Terms of Service
      </h1>
      <p className="mt-2 text-sm text-text-muted">Last updated: April 2026</p>

      <div className="mt-10 space-y-8 text-sm leading-relaxed text-text-muted">
        <section>
          <h2 className="text-lg font-semibold text-text">Use of service</h2>
          <p className="mt-2">
            QuickFill provides a browser-based PDF form filling tool. By using
            the service you agree to these terms. You must be at least 16 years
            old to create an account.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-text">
            Free and paid plans
          </h2>
          <p className="mt-2">
            Free accounts receive 3 document fills per month. Paid plans (Pro
            and Business) unlock higher or unlimited usage as described on the
            pricing page. We may adjust plan features or limits with reasonable
            notice.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-text">
            Payments and refunds
          </h2>
          <p className="mt-2">
            Paid subscriptions are billed monthly via Stripe. You can cancel at
            any time from your dashboard &mdash; access continues until the end
            of the current billing period. Refund requests made within 7 days of
            a charge will be honoured. After 7 days, no refunds are issued.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-text">Data and privacy</h2>
          <p className="mt-2">
            Your PDF documents are processed entirely in your browser. We do not
            upload, store, or access your files. For details on what data we do
            collect, see our{" "}
            <a href="/privacy" className="text-accent hover:underline">
              Privacy Policy
            </a>
            .
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-text">Acceptable use</h2>
          <p className="mt-2">
            You agree not to use QuickFill for any unlawful purpose, to
            distribute malware, or to abuse the service in a way that degrades
            it for other users. We reserve the right to suspend accounts that
            violate these terms.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-text">Changes to terms</h2>
          <p className="mt-2">
            We may update these terms from time to time. Material changes will
            be communicated via email or an in-app notice. Continued use of the
            service after changes take effect constitutes acceptance of the
            updated terms.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-text">Contact</h2>
          <p className="mt-2">
            Questions about these terms? Email us at{" "}
            <a
              href="mailto:support@quickfill.app"
              className="text-accent hover:underline"
            >
              support@quickfill.app
            </a>
            .
          </p>
        </section>
      </div>
    </div>
  );
}
