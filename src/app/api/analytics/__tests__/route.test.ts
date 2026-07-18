/**
 * @jest-environment node
 */

import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getRedis } from "@/lib/redis";
import { POST } from "../route";

jest.mock("@clerk/nextjs/server", () => ({
  auth: jest.fn(),
}));

jest.mock("@/lib/redis", () => ({
  getRedis: jest.fn(),
}));

const mockedAuth = jest.mocked(auth);
const mockedGetRedis = jest.mocked(getRedis);

function makeRawRequest(body: unknown) {
  return new NextRequest("https://getquickfill.com/api/analytics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeRequest(
  properties: unknown,
  name = "field_suggestion_lifecycle",
) {
  return makeRawRequest({ name, properties });
}

describe("analytics route field-suggestion privacy boundary", () => {
  let pipeline: {
    hincrby: jest.Mock;
    expire: jest.Mock;
    lpush: jest.Mock;
    ltrim: jest.Mock;
    exec: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    pipeline = {
      hincrby: jest.fn(),
      expire: jest.fn(),
      lpush: jest.fn(),
      ltrim: jest.fn(),
      exec: jest.fn().mockResolvedValue([]),
    };
    mockedAuth.mockResolvedValue({ userId: "user_server_only" } as never);
    mockedGetRedis.mockReturnValue({
      pipeline: jest.fn(() => pipeline),
    } as never);
  });

  it.each([
    ["eligible", { stage: "eligibility", eligibility: "eligible" }],
    ["ineligible", { stage: "eligibility", eligibility: "ineligible", reason: "invalid_request" }],
    ["requested", { stage: "review_requested" }],
    ["snapshot", {
      stage: "snapshot_ready",
      count_bucket: "2_to_5",
      scan_duration_bucket: "5_to_10_ms",
      incremental_duration_bucket: "1_to_5_ms",
    }],
    ["fail closed", {
      stage: "fail_closed",
      reason: "render_failed",
      scan_duration_bucket: "unknown",
      incremental_duration_bucket: "unknown",
    }],
    ["displayed", {
      stage: "review_displayed",
      count_bucket: "6_to_10",
      scan_duration_bucket: "10_to_25_ms",
      incremental_duration_bucket: "5_to_10_ms",
    }],
    ["retry", { stage: "retry" }],
    ["individual accept", { stage: "individual_accept" }],
    ["individual reject", { stage: "individual_reject" }],
    ["accept all", { stage: "accept_all", count_bucket: "11_to_25" }],
    ["dismissed", { stage: "dismissed" }],
    ["completed", { stage: "completed", outcome: "accepted_selected", count_bucket: "1" }],
  ])("accepts an exact %s lifecycle payload", async (_label, properties) => {
    const response = await POST(makeRequest(properties));

    expect(response.status).toBe(200);
    expect(pipeline.lpush).toHaveBeenCalledWith(
      "analytics:recent",
      expect.objectContaining({
        name: "field_suggestion_lifecycle",
        properties,
        signedIn: true,
      }),
    );
    const stored = pipeline.lpush.mock.calls[0][1];
    expect(JSON.stringify(stored)).not.toContain("user_server_only");
    expect(pipeline.exec).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["document pixels", "document_pixels", "data:image/png;base64,private"],
    ["document text", "document_text", "Jane Smith tax return"],
    ["filename", "filename", "private-form.pdf"],
    ["document URL", "document_url", "https://example.test/private-form.pdf"],
    ["field value", "field_value", "123 Main Street"],
    ["coordinates", "coordinates", { x: 10, y: 20 }],
    ["dimensions", "dimensions", { width: 100, height: 30 }],
    ["signature", "signature", "data:image/png;base64,signature"],
    ["email address", "email", "person@example.test"],
    ["Clerk ID", "clerk_id", "user_private"],
    ["session ID", "session_id", "sess_private"],
    ["user ID", "user_id", "account_private"],
    ["document fingerprint", "document_fingerprint", "qf-document-v1-private"],
    ["arbitrary error", "error_message", "private parser exception"],
  ])("rejects %s before persistence", async (_label, key, value) => {
    const response = await POST(makeRequest({
      stage: "review_requested",
      [key]: value,
    }));

    expect(response.status).toBe(400);
    expect(mockedAuth).not.toHaveBeenCalled();
    expect(mockedGetRedis).not.toHaveBeenCalled();
    expect(pipeline.lpush).not.toHaveBeenCalled();
    expect(pipeline.exec).not.toHaveBeenCalled();
  });

  it.each([
    ["filename", { filename: "private-form.pdf" }],
    ["nested metadata", { metadata: { documentText: "Jane Smith" } }],
    ["arbitrary error", { error: "private parser exception" }],
  ])("rejects top-level %s before persistence", async (_label, extra) => {
    const response = await POST(makeRawRequest({
      name: "field_suggestion_lifecycle",
      properties: { stage: "review_requested" },
      ...extra,
    }));

    expect(response.status).toBe(400);
    expect(mockedAuth).not.toHaveBeenCalled();
    expect(mockedGetRedis).not.toHaveBeenCalled();
    expect(pipeline.lpush).not.toHaveBeenCalled();
    expect(pipeline.exec).not.toHaveBeenCalled();
  });

  it.each([
    ["missing properties", undefined],
    ["array properties", []],
    ["unknown stage", { stage: "document_scanned" }],
    ["arbitrary failure reason", { stage: "fail_closed", reason: "private parser exception" }],
    ["nested failure reason", { stage: "fail_closed", reason: { message: "private" } }],
    ["normalized alias instead of exact enum", { stage: "fail_closed", reason: "render-failed" }],
    ["unknown outcome", { stage: "completed", outcome: "saved_private_form" }],
    ["invalid eligibility", { stage: "eligibility", eligibility: true }],
    ["reason on eligible event", { stage: "eligibility", eligibility: "eligible", reason: "unknown" }],
    ["outcome on retry", { stage: "retry", outcome: "dismissed" }],
    ["raw count", { stage: "accept_all", count: 3 }],
    ["numeric count bucket", { stage: "accept_all", count_bucket: 3 }],
    ["malformed count bucket", { stage: "accept_all", count_bucket: "2-5" }],
    ["malformed scan bucket", { stage: "snapshot_ready", scan_duration_bucket: "51_ms" }],
    ["unknown key", { stage: "review_requested", extra: "value" }],
  ])("rejects malformed lifecycle data: %s", async (_label, properties) => {
    const response = await POST(makeRequest(properties));

    expect(response.status).toBe(400);
    expect(mockedGetRedis).not.toHaveBeenCalled();
    expect(pipeline.exec).not.toHaveBeenCalled();
  });

  it("requires the exact lifecycle event name", async () => {
    const response = await POST(makeRequest(
      { stage: "review_requested" },
      "field_suggestion_lifecycle_v2",
    ));

    expect(response.status).toBe(400);
    expect(mockedGetRedis).not.toHaveBeenCalled();
  });

  it("preserves existing property cleaning for unrelated analytics events", async () => {
    const response = await POST(makeRawRequest({
      name: "editor_pdf_loaded",
      properties: {
        source: "upload",
        sizeKb: 42,
        nested: { retained: false },
      },
      existingEnvelopeField: "remains ignored",
    }));

    expect(response.status).toBe(200);
    expect(pipeline.lpush).toHaveBeenCalledWith(
      "analytics:recent",
      expect.objectContaining({
        name: "editor_pdf_loaded",
        properties: {
          source: "upload",
          sizeKb: 42,
          nested: null,
        },
      }),
    );
  });

  it("fails open with the existing accepted response when persistence is unavailable", async () => {
    pipeline.exec.mockRejectedValue(new Error("analytics unavailable"));

    const response = await POST(makeRequest({ stage: "review_requested" }));

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ ok: false });
  });
});
