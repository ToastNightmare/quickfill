import { renderToStaticMarkup } from "react-dom/server";
import RootLayout from "@/app/layout";

jest.mock("../globals.css", () => ({}));

jest.mock("@clerk/nextjs", () => ({
  ClerkProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

jest.mock("next/script", () => ({
  __esModule: true,
  default: ({
    id,
    src,
    strategy,
    dangerouslySetInnerHTML,
  }: {
    id: string;
    src?: string;
    strategy?: string;
    dangerouslySetInnerHTML?: { __html: string };
  }) => (
    <span
      data-script-id={id}
      data-strategy={strategy}
      data-src={src}
      dangerouslySetInnerHTML={dangerouslySetInnerHTML}
    />
  ),
}));

jest.mock("@vercel/analytics/next", () => ({
  Analytics: () => null,
}));

jest.mock("@/components/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

jest.mock("@/components/MetaPixel", () => ({
  MetaPixel: () => null,
}));

jest.mock("@/lib/config", () => ({
  APP_CONFIG: { url: "https://getquickfill.com" },
}));

const GOOGLE_ADS_ID_ENV = "NEXT_PUBLIC_QUICKFILL_GADS_ID";
const GOOGLE_ADS_LABEL_ENV =
  "NEXT_PUBLIC_QUICKFILL_GADS_CONVERSION_LABEL";
const LEGACY_GOOGLE_ADS_ID_ENV = "NEXT_PUBLIC_GOOGLE_ADS_ID";
const originalEnvironment = new Map(
  [
    GOOGLE_ADS_ID_ENV,
    GOOGLE_ADS_LABEL_ENV,
    LEGACY_GOOGLE_ADS_ID_ENV,
  ].map((name) => [name, process.env[name]]),
);

function renderLayout() {
  return renderToStaticMarkup(
    <RootLayout>
      <main>QuickFill</main>
    </RootLayout>,
  );
}

describe("RootLayout Google Ads configuration gate", () => {
  beforeEach(() => {
    delete process.env[GOOGLE_ADS_ID_ENV];
    delete process.env[GOOGLE_ADS_LABEL_ENV];
    delete process.env[LEGACY_GOOGLE_ADS_ID_ENV];
  });

  afterAll(() => {
    for (const [name, originalValue] of originalEnvironment) {
      if (originalValue === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = originalValue;
      }
    }
  });

  it.each([
    ["both values missing", undefined, undefined],
    ["ID missing", undefined, "conversion-label"],
    ["label missing", "AW-123456789", undefined],
    ["blank ID", "  ", "conversion-label"],
    ["blank label", "AW-123456789", "  "],
  ])("renders no Google script with %s", (_case, conversionId, conversionLabel) => {
    if (conversionId !== undefined) {
      process.env[GOOGLE_ADS_ID_ENV] = conversionId;
    }
    if (conversionLabel !== undefined) {
      process.env[GOOGLE_ADS_LABEL_ENV] = conversionLabel;
    }
    // The old variable must not bypass the new two-value gate.
    process.env[LEGACY_GOOGLE_ADS_ID_ENV] = "AW-LEGACY";

    const markup = renderLayout();

    expect(markup).not.toContain("googletagmanager.com/gtag/js");
    expect(markup).not.toContain("quickfill-google-ads-base");
    expect(markup).not.toContain("quickfill-google-ads-config");
  });

  it("renders the standard afterInteractive loader and config only when both values exist", () => {
    process.env[GOOGLE_ADS_ID_ENV] = "AW-123456789";
    process.env[GOOGLE_ADS_LABEL_ENV] = "conversion-label";

    const markup = renderLayout();

    expect(markup).toContain("quickfill-google-ads-base");
    expect(markup).toContain("quickfill-google-ads-config");
    expect(markup).toContain(
      "https://www.googletagmanager.com/gtag/js?id=AW-123456789",
    );
    expect(markup.match(/data-strategy="afterInteractive"/g)).toHaveLength(2);
    expect(markup).toContain("window.gtag('config', \"AW-123456789\")");
    expect(markup).not.toContain("conversion-label");
  });
});
