import crypto from "crypto";
import { currentUser } from "@clerk/nextjs/server";
import { cookies } from "next/headers";

export const ADMIN_SESSION_COOKIE = "qf_admin_session";

interface ClerkEmail {
  emailAddress?: string | null;
}

interface ClerkUserLike {
  primaryEmailAddress?: ClerkEmail | null;
  emailAddresses?: ClerkEmail[];
  publicMetadata?: Record<string, unknown>;
  privateMetadata?: Record<string, unknown>;
}

export function getAdminEmails() {
  return (process.env.ADMIN_EMAILS ?? process.env.QUICKFILL_ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

function adminPassword() {
  return (process.env.QUICKFILL_ADMIN_PASSWORD ?? process.env.ADMIN_PASSWORD ?? "").trim();
}

function timingSafeStringEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export function isAdminPasswordConfigured() {
  return adminPassword().length > 0;
}

export function verifyAdminPassword(password: string) {
  const expected = adminPassword();
  if (expected.length === 0 || password.length === 0) return false;
  return timingSafeStringEqual(password.trim(), expected);
}

export function adminSessionToken() {
  const password = adminPassword();
  if (password.length === 0) return null;
  return crypto.createHmac("sha256", password).update("quickfill-admin-session-v1").digest("hex");
}

export async function hasAdminSessionCookie() {
  const expected = adminSessionToken();
  if (!expected) return false;

  const cookieStore = await cookies();
  const provided = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  if (!provided) return false;
  return timingSafeStringEqual(provided, expected);
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

export function isAdminEmail(email?: string | null) {
  if (!email) return false;
  return getAdminEmails().includes(email.toLowerCase());
}

export function isAdminUser(user: ClerkUserLike | null | undefined) {
  if (!user) return false;
  if (hasAdminMetadata(user)) return true;

  const email =
    user.primaryEmailAddress?.emailAddress ??
    user.emailAddresses?.find((item) => item.emailAddress)?.emailAddress;

  return isAdminEmail(email);
}

export async function getAdminUser() {
  if (!(await hasAdminSessionCookie())) return null;

  try {
    const user = await currentUser();
    if (isAdminUser(user)) return user;
  } catch (error) {
    console.warn(
      "Admin session is valid, but Clerk user lookup failed.",
      error instanceof Error ? error.message : String(error),
    );
  }

  return { primaryEmailAddress: { emailAddress: "admin-session" } };
}
