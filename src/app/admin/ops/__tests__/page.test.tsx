import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import AdminOpsPage from "../page";
import { getRedis } from "@/lib/redis";

jest.mock("next/link", () => {
  const MockLink = ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  );
  MockLink.displayName = "MockLink";
  return MockLink;
});

jest.mock("@/lib/admin-routing", () => ({
  requireAdminUser: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/admin-logs", () => ({
  getSupportQueueHealth: jest.fn().mockResolvedValue(null),
}));

jest.mock("@/lib/db", () => ({
  checkDatabaseConnection: jest.fn().mockResolvedValue({ ok: true, message: "Database connected." }),
  isDatabaseConfigured: jest.fn(() => false),
  query: jest.fn(),
}));

jest.mock("@/lib/redis", () => ({
  getRedis: jest.fn(),
  isRedisConfigured: jest.fn(() => true),
}));

jest.mock("lucide-react", () => new Proxy({}, {
  get: () => {
    const MockIcon = () => <span data-testid="icon" />;
    return MockIcon;
  },
}));

const mockedGetRedis = jest.mocked(getRedis);

describe("AdminOpsPage field suggestion monitoring", () => {
  const previousFlag = process.env.NEXT_PUBLIC_QUICKFILL_FIELD_SUGGESTIONS;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.NEXT_PUBLIC_QUICKFILL_FIELD_SUGGESTIONS;
    mockedGetRedis.mockReturnValue({
      lrange: jest.fn().mockResolvedValue([
        {
          name: "field_suggestion_lifecycle",
          properties: { stage: "eligibility", eligibility: "eligible", filename: "private-form.pdf" },
        },
        {
          name: "field_suggestion_lifecycle",
          properties: { stage: "eligibility", eligibility: "eligible" },
        },
        {
          name: "field_suggestion_lifecycle",
          properties: { stage: "review_requested" },
        },
        {
          name: "field_suggestion_lifecycle",
          properties: {
            stage: "review_displayed",
            count_bucket: "2_to_5",
            scan_duration_bucket: "5_to_10_ms",
            incremental_duration_bucket: "1_to_5_ms",
          },
        },
        {
          name: "field_suggestion_lifecycle",
          properties: { stage: "fail_closed", reason: "render_failed" },
        },
        {
          name: "field_suggestion_lifecycle",
          properties: { stage: "completed", outcome: "accepted_selected" },
        },
        {
          name: "field_suggestion_lifecycle",
          properties: { stage: "completed", outcome: "dismissed" },
        },
      ]),
    } as never);
  });

  afterAll(() => {
    if (previousFlag === undefined) {
      delete process.env.NEXT_PUBLIC_QUICKFILL_FIELD_SUGGESTIONS;
    } else {
      process.env.NEXT_PUBLIC_QUICKFILL_FIELD_SUGGESTIONS = previousFlag;
    }
  });

  it("renders aggregate metrics without document-level values", async () => {
    render(await AdminOpsPage());

    expect(screen.getByRole("heading", { name: "Field suggestion rollout monitoring" })).toBeInTheDocument();
    expect(screen.getByText("Default off in this build")).toBeInTheDocument();
    expect(screen.getByText("Eligible sessions").nextSibling).toHaveTextContent("2");
    expect(screen.getByText("Directional display ratio").nextSibling).toHaveTextContent("50%");
    expect(screen.getByText(/this ratio is not cohort-safe/i)).toBeInTheDocument();
    expect(screen.getByText("Accepted outcomes").nextSibling).toHaveTextContent("1");
    expect(screen.getByText("Dismissed outcomes").nextSibling).toHaveTextContent("1");
    expect(screen.getByText("Render Failed")).toBeInTheDocument();
    expect(screen.getByText("5 To 10 Ms")).toBeInTheDocument();
    expect(screen.queryByText("private-form.pdf")).not.toBeInTheDocument();
  });
});
