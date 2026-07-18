# Profile Autofill Rollout

Last updated: 2026-07-18

## Current production state

- The shared autofill helper lives in `src/lib/profile-autofill.ts`.
- `autofillModeFromFlag(...)` defaults to `legacy` for any empty, missing, or unknown flag value.
- Supported flag values:
  - `legacy`: keep the current matching behavior.
  - `shadow`: keep legacy behavior for users, but report intelligence comparison metrics.
  - `intelligence`: apply intelligence predictions directly for auto-fill decisions.
- Mobile auto-fill is wired through `runProfileAutofill(..., autofillModeFromFlag(...))`.
- Desktop editor auto-fill is wired through `runEditorProfileAutofill(...)`, which uses the same environment flag and shared autofill helper.

## Change workflow

The obsolete GitHub Actions and script that rewrote autofill source files have been retired. They must not be restored or used to commit changes directly to `master`.

All future autofill code and rollout documentation changes must use normal pull requests with review and the required checks. Changing this workflow does not change `NEXT_PUBLIC_QUICKFILL_AUTOFILL_MODE`, its environment configuration, or any autofill behavior.

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

## Shadow and intelligence reporting

Comparison reports are emitted in `shadow` and `intelligence` modes through `trackAutofillShadowReport(...)` on mobile and `trackEditorAutofillShadowReport(...)` on desktop. Both use the existing `profile_autofill_used` analytics event with `shadowReported: true`.

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

A healthy comparison result should show high agreement with legacy, low disagreement, and useful high-confidence matches that legacy missed.

## Safety rules

- Never default the flag to `shadow` or `intelligence` in code.
- Never let shadow mode change user-visible filled values.
- Keep `whiteout` fields out of prediction/application logic.
- Keep signature field detection intact when removing old profile matcher code.
- Do not promote `intelligence` to Production until shadow reports are reviewed.
