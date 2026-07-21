/**
 * @jest-environment node
 */

import { auth, currentUser } from "@clerk/nextjs/server";
import { NextRequest } from "next/server";

import { POST } from "../route";
import { recordSupportMessage } from "@/lib/admin-logs";
import { getStoredSubscriptionSnapshot } from "@/lib/billing-store";
import { getRequestEntitlement } from "@/lib/entitlements";

jest.mock("@clerk/nextjs/server", () => ({
  auth: jest.fn(),
  currentUser: jest.fn(),
}));

jest.mock("@/lib/admin-logs", () => ({
  recordSupportMessage: jest.fn(),
}));

jest.mock("@/lib/billing-store", () => ({
  getStoredSubscriptionSnapshot: jest.fn(),
}));

jest.mock("@/lib/entitlements", () => ({
  getRequestEntitlement: jest.fn(),
}));

jest.mock("@/lib/log", () => ({
  log: {
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

jest.mock("@/lib/rate-limit", () => ({
  checkRateLimit: jest.fn().mockResolvedValue({ success: true }),
}));

const mockAuth = jest.mocked(auth);
const mockCurrentUser = jest.mocked(currentUser);
const mockRecordSupportMessage = jest.mocked(recordSupportMessage);
const mockGetStoredSubscriptionSnapshot = jest.mocked(getStoredSubscriptionSnapshot);
const mockGetRequestEntitlement = jest.mocked(getRequestEntitlement);

const attachment = {
  id: "attachment-1",
  filename: "screenshot.png",
  pathname: "support/2026-07/attachment-1-screenshot.png",
  contentType: "image/png",
  size: 1024,
  uploadedAt: "2026-07-21T00:00:00.000Z",
};

function makeRequest(attachments: unknown = []) {
  return new NextRequest("https://getquickfill.com/api/support", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": "203.0.113.10",
    },
    body: JSON.stringify({
      email: "customer@example.com",
      message: "Please help with my form.",
      attachments,
    }),
  });
}

describe("support route attachment boundary", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.QUICKFILL_ALERT_EMAILS;
    delete process.env.QUICKFILL_ADMIN_EMAILS;
    delete process.env.RESEND_API_KEY;

    mockAuth.mockResolvedValue({ userId: null } as never);
    mockCurrentUser.mockResolvedValue(null);
    mockRecordSupportMessage.mockImplementation(async (input) => ({
      ...input,
      id: "support-1",
      createdAt: "2026-07-21T00:00:00.000Z",
      updatedAt: "2026-07-21T00:00:00.000Z",
      status: "new",
      priority: input.priority ?? "normal",
      category: input.category ?? "general",
      attachments: input.attachments ?? [],
      internalNotes: "",
    }));
    mockGetStoredSubscriptionSnapshot.mockResolvedValue(null);
    mockGetRequestEntitlement.mockResolvedValue({
      userId: "user-1",
      anonymousId: null,
      tier: "free",
      limit: 3,
      isPaid: false,
      qa: false,
    });
  });

  it("accepts an anonymous support submission with the form's empty attachment list", async () => {
    const response = await POST(makeRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, id: "support-1" });
    expect(mockRecordSupportMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: null,
        attachments: [],
      }),
    );
  });

  it.each([[attachment], { pathname: attachment.pathname }])(
    "rejects anonymous attachment metadata before persistence",
    async (attachments) => {
      const response = await POST(makeRequest(attachments));

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: "Sign in to attach screenshots." });
      expect(mockRecordSupportMessage).not.toHaveBeenCalled();
    },
  );

  it("preserves authenticated attachment submissions", async () => {
    mockAuth.mockResolvedValue({ userId: "user-1" } as never);
    mockCurrentUser.mockResolvedValue({
      firstName: "Customer",
      primaryEmailAddress: { emailAddress: "customer@example.com" },
    } as never);

    const response = await POST(makeRequest([attachment]));

    expect(response.status).toBe(200);
    expect(mockRecordSupportMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        attachments: [attachment],
      }),
    );
  });
});
