import proxy from "../proxy";

const mockProtect = jest.fn();

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
  ])(
    "protects account route %s",
    async (path) => {
      await proxy(request(path));

      expect(mockProtect).toHaveBeenCalledTimes(1);
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

  it.each(["/api/stripe/webhook", "/api/webhooks/clerk", "/api/analytics", "/api/signature"])(
    "keeps self-authenticating route %s unprotected",
    async (path) => {
      await proxy(request(path));

      expect(mockProtect).not.toHaveBeenCalled();
    },
  );

  it("preserves mobile editor redirect", async () => {
    const response = await proxy(request("/editor", "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)"));

    expect(mockProtect).not.toHaveBeenCalled();
    expect(response?.headers.get("location")).toBe("https://getquickfill.com/editor?advanced=1");
  });

  it("does not redirect mobile editor when advanced mode is already requested", async () => {
    const response = await proxy(request("/editor?advanced=1", "Mozilla/5.0 (Android 14; Mobile)"));

    expect(mockProtect).not.toHaveBeenCalled();
    expect(response).toBeUndefined();
  });
});
