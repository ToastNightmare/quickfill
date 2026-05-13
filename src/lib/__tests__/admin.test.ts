import { adminSessionCookieOptions, getAdminUser } from "../admin";
import { currentUser } from "@clerk/nextjs/server";
import { cookies } from "next/headers";

jest.mock("@clerk/nextjs/server", () => ({
  currentUser: jest.fn(),
}));

jest.mock("next/headers", () => ({
  cookies: jest.fn(),
}));

const mockCurrentUser = jest.mocked(currentUser);
const mockCookies = jest.mocked(cookies);

function mockCookieValue(value?: string) {
  mockCookies.mockResolvedValue({
    get: jest.fn(() => (value ? { name: "qf_admin_session", value } : undefined)),
  } as never);
}

describe("getAdminUser", () => {
  const originalPassword = process.env.QUICKFILL_ADMIN_PASSWORD;
  const originalEmails = process.env.ADMIN_EMAILS;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.QUICKFILL_ADMIN_PASSWORD = "admin-passcode";
    process.env.ADMIN_EMAILS = "owner@getquickfill.com";
  });

  afterAll(() => {
    if (originalPassword === undefined) {
      delete process.env.QUICKFILL_ADMIN_PASSWORD;
    } else {
      process.env.QUICKFILL_ADMIN_PASSWORD = originalPassword;
    }

    if (originalEmails === undefined) {
      delete process.env.ADMIN_EMAILS;
    } else {
      process.env.ADMIN_EMAILS = originalEmails;
    }
  });

  it("renders logged-out admin as unauthenticated without calling Clerk first", async () => {
    mockCookieValue();

    await expect(getAdminUser()).resolves.toBeNull();

    expect(mockCurrentUser).not.toHaveBeenCalled();
  });

  it("checks Clerk admin email after a valid admin session exists", async () => {
    mockCookieValue("d7f4b0888e6b71a9fbec5b768e3737d6b176fd15c3f37ad5dce95d8078d60215");
    mockCurrentUser.mockResolvedValue({
      primaryEmailAddress: { emailAddress: "owner@getquickfill.com" },
    } as never);

    await expect(getAdminUser()).resolves.toEqual({
      primaryEmailAddress: { emailAddress: "owner@getquickfill.com" },
    });

    expect(mockCurrentUser).toHaveBeenCalledTimes(1);
  });

  it("keeps passcode sessions authorized when Clerk lookup fails", async () => {
    mockCookieValue("d7f4b0888e6b71a9fbec5b768e3737d6b176fd15c3f37ad5dce95d8078d60215");
    mockCurrentUser.mockRejectedValue(new Error("Clerk is unavailable"));
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(getAdminUser()).resolves.toEqual({
      primaryEmailAddress: { emailAddress: "admin-session" },
    });

    expect(mockCurrentUser).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});

describe("adminSessionCookieOptions", () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterAll(() => {
    Object.defineProperty(process.env, "NODE_ENV", {
      value: originalNodeEnv,
      configurable: true,
    });
  });

  it("scopes admin passcode sessions across admin pages and admin API requests", () => {
    Object.defineProperty(process.env, "NODE_ENV", {
      value: "production",
      configurable: true,
    });

    expect(adminSessionCookieOptions("session-token")).toEqual({
      name: "qf_admin_session",
      value: "session-token",
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      path: "/",
      maxAge: 60 * 60 * 12,
    });
  });
});
