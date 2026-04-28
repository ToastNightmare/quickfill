<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes. APIs, conventions, and file structure may differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing code that depends on Next.js behavior. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# QuickFill Agent Rules

QuickFill is a production PDF form filler at https://getquickfill.com. Treat this as a live SaaS with paying users.

## Product Contract

Users upload PDFs, place fields, fill values, and download accurate completed PDFs. Accuracy in downloaded PDF coordinates is core product behavior.

Supported field types include:

- Text
- Checkbox
- Signature
- Date
- Comb
- Whiteout
- Box

## Coordinate System Rules

Preserve the coordinate baseline from commit `446cf52`.

Do:

- Store field geometry in PDF point space.
- Convert PDF point space to canvas coordinates only for rendering.
- Keep PDF export in PDF coordinate space.
- Preserve comb field cell spacing and `offsetX` behavior.
- Wrap imported PDF page content to isolate page transforms when exporting.

Do not:

- Divide saved PDF coordinates by canvas scale during export.
- Treat visual canvas coordinates as persisted document coordinates.
- Reintroduce inverse-transform compensation unless a new regression test proves it is needed.
- Change field positioning files without focused QA.

Protected files:

- `src/components/PdfViewer.tsx`
- `src/lib/pdf-utils.ts`
- `src/app/api/fill-pdf/route.ts`
- Snap, aspect-ratio, field positioning, and export/download logic

## Build And QA Gate

Use pnpm only.

Before shipping code changes:

```bash
pnpm build
pnpm qa
```

For targeted debugging, run the smallest useful Jest or Playwright test first, then run the full gate before commit.

## Implementation Style

Prefer:

- Small, production-safe changes.
- Existing patterns over new abstractions.
- Focused regression tests for bug fixes.
- Mobile-first UI.
- Plain language in user-facing copy.

Avoid:

- Placeholder content that looks real.
- Broad refactors mixed into fixes.
- Secret values in commits.
- Manual production deploys unless Kyle asks.

## Reporting

When work is complete, report status, commit, files changed, build result, tests run, and notes.
