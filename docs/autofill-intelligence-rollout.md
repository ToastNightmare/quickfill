# Autofill Intelligence Rollout

This is the long-term path for making QuickFill autofill more accurate without replacing the stable matcher all at once.

## Current Safe State

The production autofill button can continue using the existing simple matcher. The new engine lives in `src/lib/autofill-intelligence.ts` and can run beside the existing path until we intentionally enable it.

## Engine Contract

Every detected field is converted into a candidate:

```ts
{
  id: string;
  name?: string;
  label?: string;
  nearbyText?: string;
  type: "text" | "checkbox" | "signature" | "date" | "comb";
}
```

The engine returns:

```ts
{
  fieldId: string;
  profileKey: string | null;
  confidence: number;
  decision: "auto-fill" | "review" | "suggest" | "skip";
  source: "field-name" | "field-label" | "nearby-text" | "combined-context";
  reason: string;
}
```

## Confidence Rules

- `auto-fill`: confidence is at least 0.90 and the saved profile has a value.
- `review`: confidence is at least 0.65 and the saved profile has a value.
- `suggest`: field is recognized but either confidence is lower or the saved profile value is missing.
- `skip`: no reliable match.

## Rollout Steps

1. Shadow mode: run predictions but keep the existing autofill behavior.
2. Compare: log prediction summaries and user corrections for a small sample of forms.
3. Review mode: fill high-confidence fields and surface medium-confidence fields for user review.
4. Full mode: use the new engine as the primary matcher, with the old matcher retained as fallback.
5. AI assist: only send labels/field context and available profile keys, not profile values, for low-confidence PDFs.

## Privacy Rule

The AI layer should never receive the user's saved profile values unless we explicitly add a consent step. It should return profile keys only. QuickFill then applies values locally or server-side.

## Test Pack

Keep a PDF accuracy pack with representative forms:

- ATO and tax forms
- Medicare/Centrelink style forms
- Rental applications
- Employment onboarding
- Banking/direct debit
- Council/permit forms

Track detected fields, correct matches, false fills, misses, and user corrections.
