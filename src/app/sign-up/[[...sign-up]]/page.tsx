import { SignUp } from "@clerk/nextjs";
import Image from "next/image";
import Link from "next/link";

export default function SignUpPage() {
  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center overflow-hidden bg-navy px-4 py-10 sm:py-12">
      <div className="quickfill-auth-pop flex w-full max-w-[430px] flex-col items-center gap-4">
        <Link href="/" aria-label="QuickFill home" className="rounded-2xl">
          <Image src="/logo-mark.png" alt="" width={64} height={64} priority />
        </Link>
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-bold text-white">Almost there</h1>
          <p className="mt-2 text-sm leading-6 text-gray-300">
            Start filling PDFs for free. No credit card required.
          </p>
        </div>
        <div className="w-full pt-1">
          <SignUp
            appearance={{
              elements: {
                rootBox: "mx-auto w-full",
                card: "quickfill-auth-card-pop rounded-xl border border-white/10 shadow-2xl",
                formButtonPrimary:
                  "bg-[#2d8ef7] hover:bg-[#1a7ae8] text-white",
                footerActionLink: "text-[#2d8ef7] hover:text-[#1a7ae8]",
              },
            }}
          />
        </div>
      </div>
    </div>
  );
}
