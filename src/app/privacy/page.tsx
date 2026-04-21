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
          <h2 className="text-lg font-semibold text-text">Document Processing</h2>
          <p className="mt-2">
            QuickFill processes PDFs in your browser and on our servers for download generation only.
            PDF files are processed in memory and never stored on our servers. We do not read,
            store, or share the contents of your documents. Your PDF data is used solely to
            generate the filled PDF for immediate download.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-text">Account Data</h2>
          <p className="mt-2">
            Account data (email, profile information) is stored securely via Clerk authentication
            service. Your profile information including name, address, and other personal details
            are stored encrypted and are only accessible to you when logged in.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-text">Usage Data</h2>
          <p className="mt-2">
            Usage data (fill counts, timestamps) is stored via Upstash Redis to track your monthly
            usage limits and provide usage analytics. This data is associated with your account
            and is used solely for service operation and billing purposes.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-text">Cookies</h2>
          <p className="mt-2">
            Cookies are used for authentication only. We use session cookies to maintain your
            logged-in state. These cookies are securely managed by Clerk and contain no personal
            information beyond a secure session identifier.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-text">Data Deletion</h2>
          <p className="mt-2">
            Users can delete their account and all associated data by contacting support. When
            you delete your account, all stored profile information, usage data, and signatures
            are permanently removed from our systems.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-text">Third-Party Services</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              <strong>Clerk</strong> - Authentication and account management
            </li>
            <li>
              <strong>Stripe</strong> - Payment processing (we never see or store full card numbers)
            </li>
            <li>
              <strong>Upstash</strong> - Serverless Redis for usage tracking
            </li>
            <li>
              <strong>Vercel</strong> - Hosting and deployment infrastructure
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-text">Australian Privacy Act Compliance</h2>
          <p className="mt-2">
            QuickFill is committed to compliance with the Australian Privacy Act 1988 and the
            Australian Privacy Principles. We take reasonable steps to protect your personal
            information from misuse, interference, loss, unauthorized access, modification, or
            disclosure.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-text">Contact Us</h2>
          <p className="mt-2">
            If you have any questions about this privacy policy or our data practices, please
            contact us at{" "}
            <a
              href="mailto:support@getquickfill.com"
              className="text-accent hover:underline"
            >
              support@getquickfill.com
            </a>
            .
          </p>
        </section>
      </div>
    </div>
  );
}
