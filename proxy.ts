import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/pricing",
  "/how-it-works",
  "/blog(.*)",
  "/privacy",
  "/terms",
  "/templates(.*)",
  "/editor",
  "/checkout",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/webhook(.*)",
  "/api/webhooks(.*)",
  "/api/stripe/webhook",
  "/api/fill-pdf",
  "/api/usage",
  "/api/analytics",
  "/not-found",
  "/robots.txt",
  "/sitemap.xml",
  "/opengraph-image",
]);

function isMobileRequest(req: NextRequest) {
  const ua = req.headers.get("user-agent")?.toLowerCase() ?? "";
  return /android|iphone|ipad|ipod|mobile|windows phone/.test(ua);
}

function mobileEditorRedirect(req: NextRequest) {
  const url = req.nextUrl;
  if (url.pathname !== "/editor") return null;
  if (!isMobileRequest(req)) return null;
  if (url.searchParams.get("mobile") === "simple") return null;
  if (url.searchParams.get("simple") === "1") return null;
  if (url.searchParams.get("advanced") === "1") return null;

  const nextUrl = url.clone();
  nextUrl.searchParams.set("advanced", "1");
  return NextResponse.redirect(nextUrl);
}

export default clerkMiddleware(async (auth, req) => {
  const redirect = mobileEditorRedirect(req);
  if (redirect) return redirect;

  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|m?js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
