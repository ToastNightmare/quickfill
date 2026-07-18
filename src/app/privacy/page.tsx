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
      <p className="mt-2 text-sm text-text-muted">Last updated: July 2026</p>

      <div className="mt-10 space-y-8 text-sm leading-relaxed text-text-muted">
        <section aria-labelledby="document-handling-title">
          <h2 id="document-handling-title" className="text-lg font-semibold text-text">
            How QuickFill handles your document
          </h2>
          <p className="mt-2">
            QuickFill uses different processing paths for different features. You choose whether to
            use optional cloud processing.
          </p>

          <div className="mt-5 space-y-5">
            <div>
              <h3 className="font-semibold text-text">Core editing and optional local suggestions</h3>
              <p className="mt-1">
                Much of QuickFill&apos;s editing happens in your browser. If the optional local field
                suggestion feature is offered, it reuses geometry derived from the page in your
                browser. That suggestion step does not call QuickFill&apos;s cloud detection API or send
                a page image to an external provider. This feature is not enabled for everyone.
              </p>
            </div>

            <div>
              <h3 className="font-semibold text-text">Cloud AI field detection</h3>
              <p className="mt-1">
                If you choose Detect Fields where it is available, QuickFill sends an image of the
                current page through its API to its configured third-party AI processor, currently
                OpenAI, to suggest fields.
              </p>
            </div>

            <div>
              <h3 className="font-semibold text-text">Creating the completed PDF</h3>
              <p className="mt-1">
                When you ask QuickFill to create a completed PDF, your browser can send the working
                PDF and the field data required for that request to QuickFill&apos;s server. That data can
                include text, checkbox state, and a signature image when they are part of the
                completed document.
              </p>
            </div>

            <div>
              <h3 className="font-semibold text-text">Browser-local working data</h3>
              <p className="mt-1">
                QuickFill may keep normalized working data in browser-local storage so you can
                continue your work. This can include the working PDF, placed fields, current page,
                filename, zoom, and a signature saved on that device.
              </p>
            </div>

            <div>
              <h3 className="font-semibold text-text">Limited operational telemetry</h3>
              <p className="mt-1">
                QuickFill records limited field-suggestion lifecycle events using a server-side
                allowlist. Those events exclude document pixels, field contents, coordinates, and
                raw suggestions. An internal rolling view uses the latest 500 analytics events; its
                ratio is directional because that window can split sessions, so it is not cohort-safe
                or complete rollout evidence.
              </p>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-text">Saved Signatures</h2>
          <p className="mt-2">
            If you save a signature for reuse, it may be stored locally in your browser on your
            device so you can sign again without redrawing it. You can delete it anytime from the
            signature tool. Signed-in users may also have their signature stored with their account
            for reuse across devices.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-text">Account Data</h2>
          <p className="mt-2">
            Clerk provides QuickFill&apos;s authentication and account-management service. If you add
            profile information for form filling, QuickFill stores the profile fields needed to
            provide that feature.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-text">Usage Data</h2>
          <p className="mt-2">
            QuickFill records service information such as fill counts and timestamps to enforce
            usage limits, operate the service, and understand product use. Some of this information
            is stored through Upstash Redis and may be associated with an account.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-text">Cookies</h2>
          <p className="mt-2">
            QuickFill and its service providers may use cookies or similar browser storage for
            sign-in, security, preferences, attribution, and service operation.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-text">Data Deletion</h2>
          <p className="mt-2">
            To ask about deleting account data or exercising a privacy right, please send a support
            message. QuickFill will review the request in light of the account, the data involved,
            and applicable obligations.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-text">Third-Party Services</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              <strong>Clerk</strong> - Authentication and account management
            </li>
            <li>
              <strong>Stripe</strong> - Payment processing
            </li>
            <li>
              <strong>Upstash</strong> - Serverless Redis for usage tracking
            </li>
            <li>
              <strong>Vercel</strong> - Hosting and deployment infrastructure
            </li>
            <li>
              <strong>OpenAI</strong> - AI processing when you request cloud field detection
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-text">Support</h2>
          <p className="mt-2">
            If you have any questions about this privacy policy or our data practices, please{" "}
            <a href="/support?topic=general" className="text-accent hover:underline">
              send a support message
            </a>
            .
          </p>
        </section>
      </div>
    </div>
  );
}
