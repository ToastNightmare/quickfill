import { readFileSync, writeFileSync } from "node:fs";

function read(path) {
  return readFileSync(path, "utf8");
}

function writeIfChanged(path, next) {
  const current = read(path);
  if (current !== next) writeFileSync(path, next);
}

function replaceBefore(text, start, nextMarker, replacement) {
  const startIndex = text.indexOf(start);
  if (startIndex === -1) throw new Error(`Missing start marker: ${start}`);
  const endIndex = text.indexOf(nextMarker, startIndex + start.length);
  if (endIndex === -1) throw new Error(`Missing next marker after ${start}: ${nextMarker}`);
  return text.slice(0, startIndex) + replacement + text.slice(endIndex);
}

function replaceBeforeAny(text, start, nextMarkers, replacement) {
  const startIndex = text.indexOf(start);
  if (startIndex === -1) throw new Error(`Missing start marker: ${start}`);

  const endIndex = nextMarkers
    .map((marker) => text.indexOf(marker, startIndex + start.length))
    .filter((index) => index !== -1)
    .sort((a, b) => a - b)[0];

  if (endIndex === undefined) {
    throw new Error(`Missing next marker after ${start}: ${nextMarkers.join(", ")}`);
  }

  return text.slice(0, startIndex) + replacement + text.slice(endIndex);
}

function ensureImport(text, after, addition) {
  const existingText = text.replace(/\r\n/g, "\n");
  const expectedAddition = addition.trim().replace(/\r\n/g, "\n");
  if (existingText.includes(expectedAddition)) return text;
  const anchor = after.replace(/\r?\n$/, "");
  const anchorIndex = text.indexOf(anchor);
  if (anchorIndex === -1) throw new Error(`Missing import anchor: ${after.trim()}`);

  const lineEndStart = anchorIndex + anchor.length;
  const lineEnd = text.startsWith("\r\n", lineEndStart) ? "\r\n" : "\n";
  const insertIndex = lineEndStart + lineEnd.length;
  const normalizedAddition = addition.replace(/\r?\n/g, lineEnd);
  return text.slice(0, insertIndex) + normalizedAddition + text.slice(insertIndex);
}

function replaceOnce(text, search, replacement) {
  if (text.replace(/\r\n/g, "\n").includes(replacement.trim().replace(/\r\n/g, "\n"))) return text;
  if (!text.includes(search)) throw new Error(`Missing replacement target: ${search.slice(0, 80)}`);
  return text.replace(search, replacement);
}

function lines(values) {
  return `${values.join("\n")}\n\n`;
}

function patchMobileFiller() {
  const path = "src/components/MobileFiller.tsx";
  let text = read(path).replace(/\r\n/g, "\n");

  text = ensureImport(
    text,
    'import { SignatureModal } from "@/components/SignatureModal";\n',
    'import { trackAutofillShadowReport } from "@/lib/autofill-shadow-reporting";\nimport { autofillModeFromFlag, runProfileAutofill } from "@/lib/profile-autofill";\n',
  );

  text = ensureImport(
    text,
    'import { autofillModeFromFlag, runProfileAutofill } from "@/lib/profile-autofill";\n',
    'import {\n  assertPdfDownload,\n  downloadPdfBuffer,\n  isGuestUsage,\n  loadUsageSnapshot,\n  refreshUsageAfterBillingSync,\n  shouldTryBillingSync,\n} from "@/lib/download-client";\n',
  );

  text = replaceOnce(
    text,
    '  const fileInputRef = useRef<HTMLInputElement>(null);\n',
    '  const fileInputRef = useRef<HTMLInputElement>(null);\n  const billingSyncAttemptedRef = useRef(false);\n',
  );

  text = replaceOnce(
    text,
    `      const usageRes = await fetch("/api/usage");
      if (usageRes.ok) {
        const usage = await usageRes.json();
        isPro = usage.isPro;
        canSaveFillHistory = !usage.guest && !usage.qa;
        if (!isPro && usage.used >= usage.limit) {
          showToast("Free limit reached, upgrade to Pro for unlimited fills", 5000);
          setIsDownloading(false);
          return;
        }
      }
`,
    `      let usage = await loadUsageSnapshot();
      if (usage && shouldTryBillingSync(usage) && !billingSyncAttemptedRef.current) {
        billingSyncAttemptedRef.current = true;
        usage = await refreshUsageAfterBillingSync(usage);
      }

      if (usage) {
        isPro = Boolean(usage.isPro);
        canSaveFillHistory = !isGuestUsage(usage) && !usage.qa;
        if (!isPro && (usage.used ?? 0) >= (usage.limit ?? 3)) {
          showToast("Free limit reached, upgrade to Pro for unlimited fills", 5000);
          setIsDownloading(false);
          return;
        }
      }
`,
  );

  text = replaceOnce(
    text,
    `      const blob = new Blob([resultBuf], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName.replace(/\\.pdf$/i, "") + "-filled.pdf";
      a.click();
      URL.revokeObjectURL(url);

      await fetch("/api/usage", { method: "POST" });
`,
    `      assertPdfDownload(fillRes, resultBuf);
      downloadPdfBuffer(resultBuf, fileName.replace(/\\.pdf$/i, "") + "-filled.pdf");

`,
  );

  text = text.replace(/\/\/ .+ Profile matcher[\s\S]*?const SIG_KEYWORDS/, 'const SIG_KEYWORDS');
  text = text.replace(/\r?\nfunction matchProfileKey\(name: string\): string \| null \{[\s\S]*?\r?\n}\r?\n\r?\nfunction isSignatureField/, '\nfunction isSignatureField');

  const replacement = lines([
    '  const handleAutoFill = useCallback(async () => {',
    '    try {',
    '      const res = await fetch("/api/profile");',
    '      if (!res.ok) { showToast("Sign in and save your profile first"); return; }',
    '      const profile = await res.json();',
    '      if (!profile?.fullName) { showToast("No profile saved, go to Profile to set one up"); return; }',
    '',
    '      const mode = autofillModeFromFlag(process.env.NEXT_PUBLIC_QUICKFILL_AUTOFILL_MODE);',
    '      const result = runProfileAutofill(fields, profile, mode);',
    '      setFields(result.fields);',
    '      trackAutofillShadowReport(result, { surface: "mobile", hasAcroForm });',
    '      showToast(result.matched > 0 ? `Auto-filled ${result.matched} field${result.matched > 1 ? "s" : ""}` : "No matching fields found");',
    '    } catch {',
    '      showToast("Failed to load profile");',
    '    }',
    '  }, [fields, hasAcroForm, showToast]);',
  ]);

  text = replaceBefore(text, "  const handleAutoFill = useCallback(async () => {", "  // ── Signature", replacement);
  writeIfChanged(path, text);
}

function patchEditorPage() {
  const path = "src/app/editor/page.tsx";
  let text = read(path).replace(/\r\n/g, "\n");

  text = ensureImport(
    text,
    'import { trackEvent } from "@/lib/analytics";\n',
    'import { runEditorProfileAutofill, trackEditorAutofillShadowReport } from "@/lib/editor-profile-autofill";\n',
  );

  text = ensureImport(
    text,
    'import { runEditorProfileAutofill, trackEditorAutofillShadowReport } from "@/lib/editor-profile-autofill";\n',
    'import {\n  assertPdfDownload,\n  downloadPdfBuffer,\n  isGuestUsage,\n  loadUsageSnapshot,\n  refreshUsageAfterBillingSync,\n  shouldTryBillingSync,\n} from "@/lib/download-client";\n',
  );

  text = replaceOnce(
    text,
    '  const initialRestoreDoneRef = useRef(false);\n',
    '  const initialRestoreDoneRef = useRef(false);\n  const billingSyncAttemptedRef = useRef(false);\n',
  );

  text = replaceOnce(
    text,
    `      // Check usage before downloading
      let isPro = false;
      let isGuest = false;
      const usageRes = await fetch("/api/usage");
      if (usageRes.ok) {
        const usage = await usageRes.json();
        isPro = usage.isPro;
        isGuest = usage.tier === "guest";
        
        // Guest mode: check server-side fill count
        if (isGuest && !isPro) {
          const serverFillCount = usage.used || 0;
          
          // If this would be the 3rd fill, show upsell modal BEFORE download
          // Pro users never see this modal
          if (serverFillCount >= 3) {
            trackEvent("free_limit_hit", { source: "guest_precheck", used: serverFillCount });
            setShowGuestUpsellModal(true);
            setIsDownloading(false);
            return;
          }
        }
        
        if (!isPro && !isGuest && usage.used >= usage.limit) {
          trackEvent("free_limit_hit", { source: "user_precheck", used: usage.used, limit: usage.limit });
          setShowUpgradeModal(true);
          setIsDownloading(false);
          return;
        }
      }
`,
    `      let isPro = false;
      let isGuest = false;
      let usage = await loadUsageSnapshot();
      if (usage && shouldTryBillingSync(usage) && !billingSyncAttemptedRef.current) {
        billingSyncAttemptedRef.current = true;
        usage = await refreshUsageAfterBillingSync(usage);
      }

      if (usage) {
        isPro = Boolean(usage.isPro);
        isGuest = isGuestUsage(usage);
        const used = usage.used ?? 0;
        const limit = usage.limit ?? 3;
        
        // Guest mode: check server-side fill count
        if (isGuest && !isPro) {
          // If this would be the 3rd fill, show upsell modal BEFORE download
          // Pro users never see this modal
          if (used >= limit) {
            trackEvent("free_limit_hit", { source: "guest_precheck", used });
            setShowGuestUpsellModal(true);
            setIsDownloading(false);
            return;
          }
        }
        
        if (!isPro && !isGuest && used >= limit) {
          trackEvent("free_limit_hit", { source: "user_precheck", used, limit });
          setShowUpgradeModal(true);
          setIsDownloading(false);
          return;
        }
      }
`,
  );

  text = replaceOnce(
    text,
    `      const resultBuf = await fillRes.arrayBuffer();

      const blob = new Blob([resultBuf], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName.replace(/\\.pdf$/i, "") + "-filled.pdf";
      a.click();
      URL.revokeObjectURL(url);
`,
    `      const resultBuf = await fillRes.arrayBuffer();
      assertPdfDownload(fillRes, resultBuf);
      downloadPdfBuffer(resultBuf, fileName.replace(/\\.pdf$/i, "") + "-filled.pdf");
`,
  );

  const replacement = lines([
    '  const handleAutoFillFromProfile = useCallback(async () => {',
    '    try {',
    '      const res = await fetch("/api/profile");',
    '      if (!res.ok) {',
    '        showToast("Sign in and save your profile first");',
    '        return;',
    '      }',
    '',
    '      const profile = await res.json();',
    '      if (!profile?.fullName) {',
    '        showToast("No profile saved, go to Profile to set one up");',
    '        return;',
    '      }',
    '',
    '      const result = runEditorProfileAutofill(fields, profile);',
    '      setFields(result.fields);',
    '      trackEditorAutofillShadowReport(result, { surface: "desktop", hasAcroForm, totalPages });',
    '      showToast(result.matched > 0 ? `Auto-filled ${result.matched} field${result.matched > 1 ? "s" : ""}` : "No matching profile fields found");',
    '    } catch {',
    '      showToast("Failed to load profile");',
    '    }',
    '  }, [fields, hasAcroForm, setFields, showToast, totalPages]);',
  ]);

  text = replaceBeforeAny(
    text,
    "  const handleAutoFillFromProfile = useCallback(async () => {",
    [
      "  const handleDetectFields = useCallback",
      "  const handleSignatureFieldPlaced = useCallback",
      "  const handleDownload = useCallback",
    ],
    replacement,
  );

  writeIfChanged(path, text);
}

function patchFillPdfRoute() {
  const path = "src/app/api/fill-pdf/route.ts";
  let text = read(path).replace(/\r\n/g, "\n");

  text = ensureImport(
    text,
    'import { orderFieldsForPdfDraw } from "@/lib/pdf-utils";\n',
    'import { currentUser } from "@clerk/nextjs/server";\nimport { reconcileStripeBillingForUser } from "@/lib/billing-reconciliation";\n',
  );

  const refreshHelper = lines([
    'async function refreshPaidAccessIfNeeded(request: NextRequest, access: DownloadAccess): Promise<DownloadAccess> {',
    '  if (access.isPro || !access.userId) return access;',
    '',
    '  try {',
    '    const user = await currentUser();',
    '    const email = user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses?.[0]?.emailAddress ?? null;',
    '    const result = await reconcileStripeBillingForUser(access.userId, { email });',
    '',
    '    if (result.ok || result.updated > 0) {',
    '      return getDownloadAccess(request);',
    '    }',
    '  } catch (error) {',
    '    console.warn("download_billing_sync_failed", {',
    '      userId: access.userId,',
    '      error: error instanceof Error ? error.message : String(error),',
    '    });',
    '  }',
    '',
    '  return access;',
    '}',
  ]);

  text = replaceOnce(
    text,
    'async function incrementDownloadUsage(access: DownloadAccess) {\n',
    `${refreshHelper}async function incrementDownloadUsage(access: DownloadAccess) {\n`,
  );

  text = replaceOnce(
    text,
    `    const access = await getDownloadAccess(request);
    accessForLog = access;
`,
    `    let access = await getDownloadAccess(request);
    access = await refreshPaidAccessIfNeeded(request, access);
    accessForLog = access;
`,
  );

  text = replaceOnce(
    text,
    '    const resultBytes = await pdfDoc.save({ updateFieldAppearances: false });\n',
    '    const resultBytes = await pdfDoc.save({ updateFieldAppearances: false, useObjectStreams: false });\n',
  );

  text = replaceOnce(
    text,
    '      headers: { "Content-Type": "application/pdf", "Content-Disposition": "inline" },\n',
    '      headers: { "Content-Type": "application/pdf", "Content-Disposition": "attachment" },\n',
  );

  writeIfChanged(path, text);
}

patchMobileFiller();
patchEditorPage();
patchFillPdfRoute();
