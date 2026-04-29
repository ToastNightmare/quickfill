import { currentUser } from "@clerk/nextjs/server";

interface ClerkEmail {
  emailAddress?: string | null;
}

interface ClerkUserLike {
  primaryEmailAddress?: ClerkEmail | null;
  emailAddresses?: ClerkEmail[];
  publicMetadata?: Record<string, unknown>;
  privateMetadata?: Record<string, unknown>;
}

function adminEmails() {
  return (process.env.QUICKFILL_ADMIN_EMAILS ?? process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

function hasAdminMetadata(user: ClerkUserLike) {
  const publicRole = user.publicMetadata?.role;
  const privateRole = user.privateMetadata?.role;
  return (
    user.publicMetadata?.isAdmin === true ||
    user.privateMetadata?.isAdmin === true ||
    publicRole === "admin" ||
    privateRole === "admin"
  );
}

export function isAdminUser(user: ClerkUserLike | null | undefined) {
  if (!user) return false;
  if (hasAdminMetadata(user)) return true;

  const email =
    user.primaryEmailAddress?.emailAddress ??
    user.emailAddresses?.find((item) => item.emailAddress)?.emailAddress;

  if (!email) return false;
  return adminEmails().includes(email.toLowerCase());
}

export async function getAdminUser() {
  const user = await currentUser();
  return isAdminUser(user) ? user : null;
}
