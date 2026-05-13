import { redirect } from "next/navigation";
import { getAdminUser } from "@/lib/admin";

export async function requireAdminUser() {
  const admin = await getAdminUser();
  if (!admin) redirect("/admin");
  return admin;
}
