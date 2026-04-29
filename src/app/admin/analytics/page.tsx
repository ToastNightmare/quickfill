import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAdminUser } from "@/lib/admin";
import AdminAnalyticsClient from "./AdminAnalyticsClient";

export const metadata: Metadata = {
  title: "Admin Analytics | QuickFill",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function AdminAnalyticsPage() {
  const admin = await getAdminUser();
  if (!admin) notFound();

  return <AdminAnalyticsClient />;
}
