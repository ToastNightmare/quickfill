import type { Metadata } from "next";
import { requireAdminUser } from "@/lib/admin-routing";
import AdminAnalyticsClient from "./AdminAnalyticsClient";

export const metadata: Metadata = {
  title: "Admin Analytics | QuickFill",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function AdminAnalyticsPage() {
  await requireAdminUser();

  return <AdminAnalyticsClient />;
}
