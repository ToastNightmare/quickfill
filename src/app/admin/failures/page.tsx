import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AlertTriangle, FileWarning } from "lucide-react";
import { getAdminUser } from "@/lib/admin";
import { getAdminFailureLogs } from "@/lib/admin-console";

export const metadata: Metadata = {
  title: "Failed Downloads | QuickFill",
  robots: { index: false, follow: false },
};

function formatDate(value: string) {
  return new Date(value).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" });
}

export default async function AdminFailuresPage() {
  const admin = await getAdminUser();
  if (!admin) notFound();
  const logs = await getAdminFailureLogs();

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div>
        <p className="inline-flex items-center gap-2 rounded-full bg-red-50 px-3 py-1 text-sm font-semibold text-red-700">
          <AlertTriangle className="h-4 w-4" />
          Quality watch
        </p>
        <h1 className="mt-4 text-3xl font-bold tracking-tight">Failed download logs</h1>
        <p className="mt-2 max-w-2xl text-sm text-text-muted">
          Failed and blocked PDF exports appear here so we can protect trust before users complain.
        </p>
      </div>

      <div className="mt-8 rounded-lg border border-border bg-surface shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-surface-alt text-xs uppercase text-text-muted">
              <tr>
                <th className="px-5 py-3 font-semibold">Time</th>
                <th className="px-5 py-3 font-semibold">Status</th>
                <th className="px-5 py-3 font-semibold">File</th>
                <th className="px-5 py-3 font-semibold">User</th>
                <th className="px-5 py-3 font-semibold">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {logs.map((log) => (
                <tr key={log.id}>
                  <td className="px-5 py-4 text-text-muted">{formatDate(log.createdAt)}</td>
                  <td className="px-5 py-4">
                    <span className={log.status === "blocked" ? "rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800" : "rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700"}>
                      {log.status}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <p className="font-medium">{log.filename || "Unknown PDF"}</p>
                    <p className="text-xs text-text-muted">{log.fileSizeKb ?? 0} KB | {log.fieldCount ?? 0} fields | {log.pageCount ?? 0} pages</p>
                  </td>
                  <td className="px-5 py-4 text-text-muted">{log.userId || (log.guest ? "Guest" : "Unknown")}</td>
                  <td className="px-5 py-4 text-text-muted">{log.message || log.reason || "No details"}</td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center text-text-muted">
                    <FileWarning className="mx-auto mb-3 h-8 w-8 opacity-40" />
                    No failed downloads logged.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
