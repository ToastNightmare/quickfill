import { SignUp } from "@clerk/nextjs";
import Image from "next/image";
import Link from "next/link";

function isCheckoutContext(redirectUrl: string | undefined): boolean {
  if (!redirectUrl) return false;
  try {
    const decoded = decodeURIComponent(redirectUrl);
    return decoded.includes("/checkout") || decoded.includes("download_preview_gate");
  } catch {
    return false;
  }
}

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect_url?: string }>;
}) {
  const params = await searchParams;
  const isCheckout = isCheckoutContext(params.redirect_url);

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
                Next: A$2 for 7 days, then A$25/month. Cancel anytime.
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
