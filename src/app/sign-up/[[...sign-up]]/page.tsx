import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-navy px-4 py-12">
      <SignUp
        appearance={{
          elements: {
            rootBox: "mx-auto",
            card: "rounded-xl shadow-2xl",
          },
        }}
      />
    </div>
  );
}
