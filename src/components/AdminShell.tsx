"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, ExternalLink, Home, ShieldCheck } from "lucide-react";
import { UserButton } from "@clerk/nextjs";
import { Logo } from "@/components/Logo";

const adminLinks = [
  { href: "/admin", label: "Overview", icon: Home },
  { href: "/admin/analytics", label: "Analytics", icon: BarChart3 },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="flex min-h-screen">
        <aside className="hidden w-64 shrink-0 border-r border-white/10 bg-slate-950 px-4 py-5 lg:block">
          <Link href="/admin" className="flex items-center gap-3">
            <Logo variant="mark" className="h-9 w-9" />
            <div>
              <p className="text-sm font-semibold leading-none">QuickFill</p>
              <p className="mt-1 text-xs text-slate-400">Admin</p>
            </div>
          </Link>

          <nav className="mt-8 space-y-1">
            {adminLinks.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors ${active ? "bg-white text-slate-950" : "text-slate-300 hover:bg-white/10 hover:text-white"}`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="mt-8 rounded-lg border border-white/10 bg-white/5 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <ShieldCheck className="h-4 w-4 text-accent" />
              Separate admin mode
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-400">
              Same secure login, separate back-office interface.
            </p>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/95 backdrop-blur">
            <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
              <div className="flex min-w-0 items-center gap-3 lg:hidden">
                <Logo variant="mark" className="h-8 w-8" />
                <div>
                  <p className="text-sm font-semibold leading-none">QuickFill Admin</p>
                  <p className="mt-1 text-xs text-slate-400">Back office</p>
                </div>
              </div>
              <nav className="hidden items-center gap-2 lg:flex">
                {adminLinks.map((item) => {
                  const active = pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${active ? "bg-white text-slate-950" : "text-slate-300 hover:bg-white/10 hover:text-white"}`}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
              <div className="ml-auto flex items-center gap-3">
                <Link
                  href="/dashboard"
                  className="hidden rounded-lg px-3 py-2 text-sm font-semibold text-slate-300 transition-colors hover:bg-white/10 hover:text-white sm:inline-flex"
                >
                  User dashboard
                </Link>
                <Link
                  href="/"
                  className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-sm font-semibold text-slate-200 transition-colors hover:bg-white/10"
                >
                  <ExternalLink className="h-4 w-4" />
                  View site
                </Link>
                <UserButton appearance={{ elements: { avatarBox: "h-9 w-9" } }} />
              </div>
            </div>
            <div className="flex gap-2 overflow-x-auto border-t border-white/10 px-4 py-2 lg:hidden">
              {adminLinks.map((item) => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`shrink-0 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${active ? "bg-white text-slate-950" : "text-slate-300 hover:bg-white/10 hover:text-white"}`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </header>

          <div className="flex-1 bg-surface-alt text-text">{children}</div>
        </div>
      </div>
    </div>
  );
}
