import proxy from "../proxy";

const mockProtect = jest.fn();
const MOBILE_SIMPLE_DEFAULT_FLAG = "NEXT_PUBLIC_QUICKFILL_MOBILE_SIMPLE_DEFAULT";
const originalMobileSimpleDefaultFlag = process.env[MOBILE_SIMPLE_DEFAULT_FLAG];

jest.mock("next/server", () => ({
  NextResponse: {
    redirect: (url: URL) => ({
      headers: {
        get: (key: string) => (key.toLowerCase() === "location" ? url.toString() : null),
      },
    }),
  },
}));

jest.mock("@clerk/nextjs/server", () => {
  const patternToRegex = (pattern: string) => {
    const escaped = pattern
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      .replace(/\\\(\\.\\\*\\\)/g, ".*");
    return new RegExp(`^${escaped}$`);
  };

  return {
    createRouteMatcher: (patterns: string[]) => {
      const matchers = patterns.map(patternToRegex);
      return (req: { nextUrl: { pathname: string } }) =>
        matchers.some((matcher) => matcher.test(req.nextUrl.pathname));
    },
    clerkMiddleware: (
      handler: (auth: { protect: typeof mockProtect }, req: ReturnType<typeof request>) => Promise<unknown> | unknown,
    ) => {
      return (req: ReturnType<typeof request>) => handler({ protect: mockProtect }, req);
    },
  };
});

function request(path: string, userAgent = "Mozilla/5.0") {
  const url = new URL(path, "https://getquickfill.com");
  return {
    nextUrl: {
      pathname: url.pathname,
      searchParams: url.searchParams,
      clone: () => new URL(url.toString()),
    },
    headers: {
      get: (key: string) => (key.toLowerCase() === "user-agent" ? userAgent : null),
    },
  };
}

describe("proxy auth protection", () => {
  beforeEach(() => {
    mockProtect.mockReset();
    delete process.env[MOBILE_SIMPLE_DEFAULT_FLAG];
  });

  afterAll(() => {
    if (originalMobileSimpleDefaultFlag === undefined) {
      delete process.env[MOBILE_SIMPLE_DEFAULT_FLAG];
    } else {
      process.env[MOBILE_SIMPLE_DEFAULT_FLAG] = originalMobileSimpleDefaultFlag;
    }
  });

  it.each([
    "/dashboard",
    "/dashboard/analytics",
    "/profile",
    "/admin",
    "/api/fills",
    "/api/profile",
    "/api/session",
    "/api/detect-fields",
    "/api/admin/health",
    "/api/supporting",
    "/api/support/extra",
    "/api/support/attachments",
    "/api/support/attachments?query=value",
    "/api/support/attachments/extra",
  ])(
    "protects account route %s",
    async (path) => {
      await proxy(request(path));

      expect(mockProtect).toHaveBeenCalledTimes(1);
    },
  );

  it.each(["/api/support", "/api/support?query=value"])(
    "keeps public support submission route %s unprotected",
    async (path) => {
      await proxy(request(path));

      expect(mockProtect).not.toHaveBeenCalled();
    },
  );

  it.each([
    "/",
    "/pdf-form-filler",
    "/pricing",
    "/editor",
    "/templates",
    "/templates/ato-tfn-declaration",
    "/blog",
    "/blog/latest",
    "/support",
    "/privacy",
    "/terms",
    "/sign-in",
    "/sign-up",
    "/checkout",
  ])(
    "keeps public route %s unprotected",
    async (path) => {
      await proxy(request(path));

      expect(mockProtect).not.toHaveBeenCalled();
    },
  );

  it.each([
    "/api/stripe/webhook",
    "/api/webhooks/clerk",
    "/api/cron/reconcile-billing",
    "/api/analytics",
    "/api/signature",
  ])(
    "keeps self-authenticating route %s unprotected",
    async (path) => {
      await proxy(request(path));

      expect(mockProtect).not.toHaveBeenCalled();
    },
  );

  it("preserves the mobile editor redirect when the simple default flag is off", async () => {
    const response = await proxy(request("/editor", "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)"));

    expect(mockProtect).not.toHaveBeenCalled();
    expect(response?.headers.get("location")).toBe("https://getquickfill.com/editor?advanced=1");
  });

  it.each(["", "true", "V1", "local-v1"])(
    "keeps the mobile editor redirect for non-v1 flag value %j",
    async (value) => {
      process.env[MOBILE_SIMPLE_DEFAULT_FLAG] = value;

      const response = await proxy(request("/editor", "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)"));

      expect(response?.headers.get("location")).toBe("https://getquickfill.com/editor?advanced=1");
    },
  );

  it("does not redirect a phone from the simple default when the flag is v1", async () => {
    process.env[MOBILE_SIMPLE_DEFAULT_FLAG] = "v1";

    const response = await proxy(request("/editor", "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)"));

    expect(mockProtect).not.toHaveBeenCalled();
    expect(response).toBeUndefined();
  });

  it("keeps the paid-return query on the legacy advanced redirect when the flag is off", async () => {
    const response = await proxy(request(
      "/editor?download=ready",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
    ));

    expect(response?.headers.get("location")).toBe(
      "https://getquickfill.com/editor?download=ready&advanced=1",
    );
  });

  it("keeps the paid return in the simple flow when the flag is v1", async () => {
    process.env[MOBILE_SIMPLE_DEFAULT_FLAG] = "v1";

    const response = await proxy(request(
      "/editor?download=ready",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
    ));

    expect(response).toBeUndefined();
  });

  it("does not redirect mobile editor when advanced mode is already requested", async () => {
    process.env[MOBILE_SIMPLE_DEFAULT_FLAG] = "v1";

    const response = await proxy(request("/editor?advanced=1", "Mozilla/5.0 (Android 14; Mobile)"));

    expect(mockProtect).not.toHaveBeenCalled();
    expect(response).toBeUndefined();
  });

  it.each(["/editor?mobile=simple", "/editor?simple=1"])(
    "continues to honor the explicit simple escape %s",
    async (path) => {
      const response = await proxy(request(path, "Mozilla/5.0 (Android 14; Mobile)"));

      expect(response).toBeUndefined();
    },
  );

  it.each([undefined, "v1"])(
    "leaves desktop editor requests unchanged when the flag is %s",
    async (value) => {
      if (value === undefined) delete process.env[MOBILE_SIMPLE_DEFAULT_FLAG];
      else process.env[MOBILE_SIMPLE_DEFAULT_FLAG] = value;

      const response = await proxy(request("/editor", "Mozilla/5.0 (X11; Linux x86_64)"));

      expect(response).toBeUndefined();
    },
  );
});
