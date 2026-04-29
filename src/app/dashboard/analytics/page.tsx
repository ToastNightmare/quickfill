import { notFound, redirect } from "next/navigation";
import { getAdminUser } from "@/lib/admin";

export default async function DashboardAnalyticsRedirect() {
  const admin = await getAdminUser();
  if (!admin) notFound();

  redirect("/admin/analytics");
}
