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

function lines(values) {
  return `${values.join("\n")}\n\n`;
}

function patchMobileFiller() {
  const path = "src/components/MobileFiller.tsx";
  let text = read(path);

  text = ensureImport(
    text,
    'import { SignatureModal } from "@/components/SignatureModal";\n',
    'import { trackAutofillShadowReport } from "@/lib/autofill-shadow-reporting";\nimport { autofillModeFromFlag, runProfileAutofill } from "@/lib/profile-autofill";\n',
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
  let text = read(path);

  text = ensureImport(
    text,
    'import { trackEvent } from "@/lib/analytics";\n',
    'import { runEditorProfileAutofill, trackEditorAutofillShadowReport } from "@/lib/editor-profile-autofill";\n',
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

patchMobileFiller();
patchEditorPage();
