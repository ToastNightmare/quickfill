# Profile Autofill Rollout

Last updated: 2026-05-11

## Current production state

- The shared autofill helper lives in `src/lib/profile-autofill.ts`.
- `autofillModeFromFlag(...)` defaults to `legacy` for any empty, missing, or unknown flag value.
- Supported flag values:
  - `legacy`: keep the current matching behavior.
  - `shadow`: keep legacy behavior for users, but report intelligence comparison metrics.
  - `intelligence`: apply intelligence predictions directly for auto-fill decisions.
- Mobile auto-fill is wired through `runProfileAutofill(..., autofillModeFromFlag(...))`.
- Desktop editor auto-fill is not yet enabled through the adapter because the desktop build path failed without readable Vercel logs.

## Environment flag

Use this Vercel environment variable when rolling out:

```text
NEXT_PUBLIC_QUICKFILL_AUTOFILL_MODE=legacy
```

Recommended rollout order:

1. Keep Production on `legacy`.
2. Set Preview to `shadow` and test with real PDFs.
3. When reports look clean, set Production to `shadow`.
4. Only consider `intelligence` after enough shadow reports prove it is better than legacy.

## Shadow reporting

Shadow reports are emitted through `trackAutofillShadowReport(...)` using the existing `profile_autofill_used` analytics event with `shadowReported: true`.

Watch these fields:

- `legacyMatched`
- `intelligenceAutoFill`
- `intelligenceReview`
- `intelligenceSuggest`
- `intelligenceSkip`
- `agreementCount`
- `disagreementCount`
- `missingProfileValueCount`
- `averageConfidence`
- `highConfidenceWithoutLegacyCount`
- `surface`
- `hasAcroForm`

A healthy shadow result should show high agreement with legacy, low disagreement, and useful high-confidence matches that legacy missed.

## Desktop blocker

Desktop wiring should replace `handleAutoFillFromProfile` in `src/app/editor/page.tsx` with the same flow used on mobile:

```ts
const mode = autofillModeFromFlag(process.env.NEXT_PUBLIC_QUICKFILL_AUTOFILL_MODE);
const result = runProfileAutofill(fields, profile, mode);
setFields(result.fields);
trackAutofillShadowReport(result, {
  surface: "desktop",
  hasAcroForm,
  totalPages,
});
```

The build failed when the adapter patched the desktop handler. Vercel logs are currently blocked by team-scope auth for `toastnightmare-6181s-projects`, so the exact TypeScript line is not visible from Codex.

To unblock:

1. Open the failed Vercel deployment for the desktop adapter attempt.
2. Copy the first TypeScript error line and the file path/line number.
3. Patch only that desktop bridge issue.
4. Re-enable desktop adapter wiring.
5. Confirm Vercel green.

## Safety rules

- Never default the flag to `shadow` or `intelligence` in code.
- Never let shadow mode change user-visible filled values.
- Keep `whiteout` fields out of prediction/application logic.
- Keep signature field detection intact when removing old profile matcher code.
- Do not promote `intelligence` to Production until shadow reports are reviewed.
