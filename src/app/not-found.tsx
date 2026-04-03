import Link from "next/link";
import { FileText, ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-accent/10">
        <FileText className="h-10 w-10 text-accent" />
      </div>
      <h1 className="mt-6 text-4xl font-extrabold">404</h1>
      <p className="mt-3 text-lg font-semibold">Page not found</p>
      <p className="mt-2 max-w-sm text-sm text-text-muted">
        The page you are looking for does not exist or has been moved.
      </p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Link
          href="/"
          className="flex h-11 items-center justify-center gap-2 rounded-xl bg-accent px-6 text-sm font-semibold text-white hover:bg-accent-hover transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Home
        </Link>
        <Link
          href="/editor"
          className="flex h-11 items-center justify-center rounded-xl border border-border px-6 text-sm font-semibold hover:bg-surface-alt transition-colors"
        >
          Open Editor
        </Link>
      </div>
    </div>
  );
}
