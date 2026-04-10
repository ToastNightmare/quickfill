import { SignIn } from "@clerk/nextjs";
import Link from "next/link";

export default function SignInPage() {
  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-navy px-4 py-12">
      <div className="flex flex-col items-center gap-5 w-full">
        <Link href="/">
          <img src="/logo-mark.png" alt="QuickFill" className="h-16 w-16" />
        </Link>
        <p className="text-gray-300 text-sm text-center">
          Welcome back, your PDFs are waiting
        </p>
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
