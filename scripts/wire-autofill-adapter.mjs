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

function ensureImport(text, after, addition) {
  if (text.includes(addition.trim())) return text;
  if (!text.includes(after)) throw new Error(`Missing import anchor: ${after.trim()}`);
  return text.replace(after, after + addition);
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

  text = text.replace(/\/\/ .+ Profile matcher[\s\S]*?function isSignatureField\(name: string\): boolean \{/, 'function isSignatureField(name: string): boolean {');

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
    'import { trackAutofillShadowReport } from "@/lib/autofill-shadow-reporting";\nimport { autofillModeFromFlag, runProfileAutofill } from "@/lib/profile-autofill";\n',
  );

  text = text.replace(/\/\/ Profile field matching keywords\nconst PROFILE_MATCHERS:[\s\S]*?\n}\n\n\/\/ Poll the canvas/, "// Poll the canvas");

  const replacement = lines([
    '  const handleAutoFillFromProfile = useCallback(async () => {',
    '    try {',
    '      const res = await fetch("/api/profile");',
    '      if (!res.ok) {',
    '        showToast("Sign in and save your profile first");',
    '        return;',
    '      }',
    '      const profile = await res.json();',
    '      if (!profile?.fullName) {',
    '        showToast("No profile saved, go to Profile to set one up");',
    '        return;',
    '      }',
    '',
    '      const mode = autofillModeFromFlag(process.env.NEXT_PUBLIC_QUICKFILL_AUTOFILL_MODE);',
    '      const result = runProfileAutofill(fields, profile, mode);',
    '      setFields(result.fields);',
    '      trackAutofillShadowReport(result, {',
    '        surface: "desktop",',
    '        hasAcroForm,',
    '        totalPages,',
    '      });',
    '      showToast(result.matched > 0 ? `Auto-filled ${result.matched} field${result.matched > 1 ? "s" : ""}` : "No matching profile fields found");',
    '    } catch {',
    '      showToast("Failed to load profile");',
    '    }',
    '  }, [fields, hasAcroForm, setFields, showToast, totalPages]);',
  ]);

  text = replaceBefore(text, "  const handleAutoFillFromProfile = useCallback(async () => {", "  const handleDetectFields", replacement);
  writeIfChanged(path, text);
}

patchMobileFiller();
patchEditorPage();
