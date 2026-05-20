import { AdminShell } from "@/components/AdminShell";
import { getAdminUser } from "@/lib/admin";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await getAdminUser();

  if (!admin) {
    return <>{children}</>;
  }

  return <AdminShell>{children}</AdminShell>;
}
