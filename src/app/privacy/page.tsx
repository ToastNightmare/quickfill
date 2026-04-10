import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy | QuickFill",
  description: "How QuickFill collects, uses, and protects your data.",
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
        Privacy Policy
      </h1>
      <p className="mt-2 text-sm text-text-muted">Last updated: April 2026</p>

      <div className="mt-10 space-y-8 text-sm leading-relaxed text-text-muted">
        <section>
          <h2 className="text-lg font-semibold text-text">What we collect</h2>
          <p className="mt-2">
            When you create an account we store your email address and name
            (provided via Clerk authentication). When you subscribe to a paid
            plan we store billing identifiers provided by Stripe. We also record
            basic usage data such as the number of documents you fill each month
            and timestamps of those fills.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-text">How we use it</h2>
          <p className="mt-2">
            We use your data to operate the service, enforcing usage
            limits, processing payments, and showing your fill history. We do
            not sell or rent your personal information to anyone.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-text">Data storage</h2>
          <p className="mt-2">
            Your PDF documents are processed entirely in your browser. We never
            upload, store, or transmit your PDF files to our servers. Usage
            metadata (fill counts, timestamps, field counts) is stored in
            Upstash Redis.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-text">Third parties</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              <strong>Clerk</strong>, authentication and account
              management.
            </li>
            <li>
              <strong>Stripe</strong>, payment processing. We never see
              or store your full card number.
            </li>
            <li>
              <strong>Upstash</strong>, serverless data storage for usage
              records.
            </li>
          </ul>
          <p className="mt-2">
            Each third party processes data under their own privacy policy. We
            only share the minimum information required for each service to
            function.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-text">Your rights</h2>
          <p className="mt-2">
            You can request a copy of your data or ask us to delete your account
            at any time. Deleting your account removes all stored usage data and
            cancels any active subscription.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-text">Contact</h2>
          <p className="mt-2">
            If you have questions about this policy, email us at{" "}
            <a
              href="mailto:hello@getquickfill.com"
              className="text-accent hover:underline"
            >
              hello@getquickfill.com
            </a>
            .
          </p>
        </section>
      </div>
    </div>
  );
}
