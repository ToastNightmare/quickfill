import { readFileSync, writeFileSync } from "node:fs";

const path = "src/app/editor/page.tsx";

function normalize(text) {
  return text.replace(/\r\n/g, "\n");
}

function writeIfChanged(path, next) {
  const current = readFileSync(path, "utf8");
  if (normalize(current) !== next) writeFileSync(path, next);
}

function replaceOnce(text, search, replacement, label) {
  if (text.includes(replacement)) return text;
  if (!text.includes(search)) throw new Error(`Missing guest download copy anchor (${label}): ${search.slice(0, 140)}`);
  return text.replace(search, replacement);
}

function insertAfterIfMissing(text, marker, snippet, needle, label) {
  if (text.includes(needle)) return text;
  if (!text.includes(marker)) throw new Error(`Missing guest download copy marker (${label}): ${marker.slice(0, 140)}`);
  return text.replace(marker, `${marker}${snippet}`);
}

let text = normalize(readFileSync(path, "utf8"));

text = insertAfterIfMissing(
  text,
  `  const [showGuestSignupPrompt, setShowGuestSignupPrompt] = useState(false);\n`,
  `  const [guestFreeDownloadsRemaining, setGuestFreeDownloadsRemaining] = useState<number | null>(null);\n`,
  "guestFreeDownloadsRemaining",
  "guest remaining state",
);

text = replaceOnce(
  text,
  `{ icon: ShieldCheck, title: "Free to start", body: "Three free fills each month, with watermark." },`,
  `{ icon: ShieldCheck, title: "Free to start", body: "Three free PDF downloads each month, with watermark." },`,
  "free card copy",
);

text = replaceOnce(
  text,
  `      // For guest mode, show signup prompt after download\n      if (isGuest) {\n        setShowGuestSignupPrompt(true);\n      }`,
  `      // For guest mode, show signup prompt after download\n      if (isGuest) {\n        let remaining: number | null = null;\n        try {\n          const updatedUsageRes = await fetch("/api/usage", { cache: "no-store" });\n          if (updatedUsageRes.ok) {\n            const updatedUsage = await updatedUsageRes.json();\n            const used = typeof updatedUsage.used === "number" ? updatedUsage.used : null;\n            const limit = typeof updatedUsage.limit === "number" ? updatedUsage.limit : null;\n            if (used !== null && limit !== null) {\n              remaining = Math.max(limit - used, 0);\n            }\n          }\n        } catch {\n          // The prompt can still show without a remaining count.\n        }\n        setGuestFreeDownloadsRemaining(remaining);\n        setShowGuestSignupPrompt(true);\n      }`,
  "guest remaining after download",
);

text = replaceOnce(
  text,
  `            <h2 className="text-xl font-bold mb-2">Your PDF is ready!</h2>\n            <p className="text-text-muted text-sm mb-6">\n              Create a free account to get 3 fills per month, save your Australian profile, and re-fill forms instantly.\n            </p>\n            <Link href="/sign-up" className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-accent text-sm font-semibold text-white hover:bg-accent-hover transition-colors mb-3">\n              Create Free Account\n            </Link>`,
  `            <h2 className="text-xl font-bold mb-2">Your PDF downloaded</h2>\n            <p className="text-text-muted text-sm mb-6">\n              {guestFreeDownloadsRemaining === null\n                ? "Create a free account to save your profile and refill forms faster. Free plans include 3 downloads each month."\n                : guestFreeDownloadsRemaining > 0\n                  ? \`You have \${guestFreeDownloadsRemaining} free download\${guestFreeDownloadsRemaining === 1 ? "" : "s"} left. Create a free account to save your profile and refill forms faster.\`\n                  : "That was your third free download. Create a free account to save your profile, or upgrade to Pro for unlimited downloads."}\n            </p>\n            {guestFreeDownloadsRemaining === 0 ? (\n              <>\n                <Link href="/pricing" className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-accent text-sm font-semibold text-white hover:bg-accent-hover transition-colors mb-3">\n                  Upgrade to Pro\n                </Link>\n                <Link href="/sign-up" className="mb-3 flex h-11 w-full items-center justify-center rounded-xl border border-border text-sm font-semibold hover:bg-surface-alt transition-colors">\n                  Create Free Account\n                </Link>\n              </>\n            ) : (\n              <Link href="/sign-up" className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-accent text-sm font-semibold text-white hover:bg-accent-hover transition-colors mb-3">\n                Create Free Account\n              </Link>\n            )}`,
  "guest signup prompt copy",
);

text = replaceOnce(
  text,
  `<h2 className="text-2xl font-bold mb-2">You&apos;ve used your 3 free fills</h2>\n            <p className="text-text-muted text-sm mb-6">\n              Upgrade to QuickFill Pro for unlimited fills with no watermarks.\n            </p>`,
  `<h2 className="text-2xl font-bold mb-2">You&apos;ve used your 3 free downloads</h2>\n            <p className="text-text-muted text-sm mb-6">\n              Upgrade to QuickFill Pro for unlimited PDF downloads with no watermarks.\n            </p>`,
  "guest limit modal copy",
);

text = replaceOnce(
  text,
  `                You have used all 3 of your free fills this month. Upgrade to Pro for unlimited fills with no watermarks.`,
  `                You have used all 3 free downloads this month. Upgrade to Pro for unlimited PDF downloads with no watermarks.`,
  "signed-in free limit copy",
);

writeIfChanged(path, text);
