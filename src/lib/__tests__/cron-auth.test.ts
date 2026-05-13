import { isAuthorizedCronRequest } from "../cron-auth";

function requestWithAuthorization(value: string | null) {
  return {
    headers: new Headers(value === null ? undefined : { authorization: value }),
  };
}

describe("cron health-check authorization", () => {
  const originalCronSecret = process.env.CRON_SECRET;

  afterEach(() => {
    if (originalCronSecret === undefined) {
      delete process.env.CRON_SECRET;
    } else {
      process.env.CRON_SECRET = originalCronSecret;
    }
  });

  it("accepts the configured CRON_SECRET as a bearer token", () => {
    process.env.CRON_SECRET = "scheduled-monitor-secret";

    expect(isAuthorizedCronRequest(requestWithAuthorization("Bearer scheduled-monitor-secret"))).toBe(true);
  });

  it("rejects missing, unset, or mismatched cron secrets", () => {
    process.env.CRON_SECRET = "scheduled-monitor-secret";

    expect(isAuthorizedCronRequest(requestWithAuthorization(null))).toBe(false);
    expect(isAuthorizedCronRequest(requestWithAuthorization("Bearer wrong-secret"))).toBe(false);

    delete process.env.CRON_SECRET;
    expect(isAuthorizedCronRequest(requestWithAuthorization("Bearer scheduled-monitor-secret"))).toBe(false);
  });
});
