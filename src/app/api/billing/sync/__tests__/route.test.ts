/**
 * @jest-environment node
 */

import { NextRequest } from "next/server";
import { GET } from "../route";

jest.mock("@clerk/nextjs/server", () => ({
  auth: jest.fn().mockResolvedValue({ userId: null }),
  currentUser: jest.fn(),
}));

jest.mock("@/lib/billing-reconciliation", () => ({
  reconcileStripeBillingForUser: jest.fn(),
}));

jest.mock("@/lib/billing-sync-audit", () => ({
  recordBillingSync: jest.fn(),
}));

jest.mock("@/lib/rate-limit", () => ({
  checkRateLimit: jest.fn(),
}));

function requestWithReturnTo(returnTo: string) {
  const url = new URL("https://getquickfill.com/api/billing/sync");
  url.searchParams.set("returnTo", returnTo);
  return new NextRequest(url);
}

describe("safeReturnTo", () => {
  it.each([
    "/\\evil.com",
    "/\\/evil.com",
    "//evil.com",
    "/dashboard\u0000?x=1",
  ])("rejects unsafe return path %p", async (returnTo) => {
    const response = await GET(requestWithReturnTo(returnTo));

    expect(response.headers.get("location")).toBe(
      "https://getquickfill.com/dashboard?upgraded=true&billingSync=not_signed_in",
    );
  });

  it("allows a same-origin dashboard path", async () => {
    const response = await GET(requestWithReturnTo("/dashboard?x=1"));

    expect(response.headers.get("location")).toBe(
      "https://getquickfill.com/dashboard?x=1&billingSync=not_signed_in",
    );
  });

  it("preserves the upgraded dashboard success rewrite", async () => {
    const response = await GET(requestWithReturnTo("/dashboard?upgraded=true"));

    expect(response.headers.get("location")).toBe(
      "https://getquickfill.com/checkout/success?synced=true&billingSync=not_signed_in",
    );
  });
});
