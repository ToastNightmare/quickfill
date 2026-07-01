import { SignIn } from "@clerk/nextjs";
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

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect_url?: string }>;
}) {
  const params = await searchParams;
  const isCheckout = isCheckoutContext(params.redirect_url);

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-navy px-4 py-12">
      <div className="flex flex-col items-center gap-5 w-full">
        <Link href="/">
          <img src="/logo-mark.png" alt="QuickFill" className="h-16 w-16" />
        </Link>
        {isCheckout ? (
          <div className="text-center">
            <p className="text-white font-semibold text-base">
              Sign in to unlock your download
            </p>
            <p className="text-gray-300 text-sm mt-1">
              Your document is saved. Sign in, then continue to secure checkout.
            </p>
            <p className="text-gray-400 text-xs mt-1">
              Next: A$2 for 7 days, then A$25/month. Cancel anytime.
            </p>
          </div>
        ) : (
          <p className="text-gray-300 text-sm text-center">
            Welcome back, your PDFs are waiting
          </p>
        )}
        <SignIn
          appearance={{
            elements: {
              rootBox: "mx-auto",
              card: "rounded-xl shadow-2xl",
              formButtonPrimary: "bg-[#2d8ef7] hover:bg-[#1a7ae8] text-white",
              footerActionLink: "text-[#2d8ef7] hover:text-[#1a7ae8]",
            },
          }}
        />
      </div>
    </div>
  );
}
