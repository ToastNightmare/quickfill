import { SignUp } from "@clerk/nextjs";
import Image from "next/image";
import Link from "next/link";
import {
  pricingV2AuthSummary,
  pricingV2Enabled,
  type PricingV2Billing,
} from "@/lib/pricing-v2";

function checkoutBilling(redirectUrl: string | undefined): PricingV2Billing | null {
  if (!redirectUrl) return null;
  try {
    const decoded = decodeURIComponent(redirectUrl);
    if (!decoded.includes("/checkout") && !decoded.includes("download_preview_gate")) return null;

    const billing = new URL(decoded, "https://getquickfill.com").searchParams.get("billing");
    if (billing === "monthly" || billing === "sale") return billing;
    return "annual";
  } catch {
    return null;
  }
}

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect_url?: string }>;
}) {
  const params = await searchParams;
  const billing = checkoutBilling(params.redirect_url);
  const isCheckout = billing !== null;
  const checkoutPriceCopy = billing && pricingV2Enabled(process.env.NEXT_PUBLIC_QUICKFILL_PRICING_V2)
    ? pricingV2AuthSummary(billing)
    : "Next: A$2 for 7 days, then A$25/month. Cancel anytime.";

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center overflow-hidden bg-navy px-4 py-10 sm:py-12">
      <div className="quickfill-auth-pop flex w-full max-w-[430px] flex-col items-center gap-4">
        <Link href="/" aria-label="QuickFill home" className="rounded-2xl">
          <Image src="/logo-mark.png" alt="" width={64} height={64} priority />
        </Link>
        <div className="max-w-md text-center">
          {isCheckout ? (
            <>
              <h1 className="text-2xl font-bold text-white">
                Create your account to unlock your download
              </h1>
              <p className="mt-2 text-sm leading-6 text-gray-300">
                Your document is saved. Create an account, then continue to secure checkout.
              </p>
              <p className="mt-1 text-xs text-gray-400">
                {checkoutPriceCopy}
              </p>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-bold text-white">Almost there</h1>
              <p className="mt-2 text-sm leading-6 text-gray-300">
                Start filling PDFs for free. No credit card required.
              </p>
            </>
          )}
        </div>
        <div className="w-full pt-1">
          <SignUp
            appearance={{
              elements: {
                rootBox: "mx-auto w-full",
                card: "quickfill-auth-card-pop rounded-xl border border-white/10 shadow-2xl",
                formButtonPrimary: "bg-[#2d8ef7] hover:bg-[#1a7ae8] text-white",
                footerActionLink: "text-[#2d8ef7] hover:text-[#1a7ae8]",
              },
            }}
          />
        </div>
      </div>
    </div>
  );
}
