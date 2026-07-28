# Rotation-safe PDF downloads

QuickFill's rotation-safe download path is build-gated and default-off.

## Rollout flag

The path is enabled only by this exact value:

```text
NEXT_PUBLIC_QUICKFILL_ROTATION_SAFE_DOWNLOAD=local-v1
```

Unset values and near matches such as `true`, `LOCAL-V1`, or `local-v1 ` keep
the existing download behavior. Because this is a `NEXT_PUBLIC_` variable,
its value is fixed by `next build`; changing the runtime environment without
rebuilding does not change the deployed behavior.

When enabled:

- the viewer-safe copy retains each source page's `/Rotate` entry;
- raw MediaBox width and height remain unchanged;
- editor fields are mapped from the rotated pdf.js viewport into raw PDF page
  space before the retained page rotation is applied;
- free-account watermarks and their link rectangles use displayed top and
  bottom edges; and
- Pro output remains free of QuickFill watermark annotations.

Rollback is a default-off rebuild without the exact flag. No data migration,
PDF rewrite, or rollout-state mutation is required.

## Verification

The enforced PDF accuracy pack contains 26 tests, up deliberately from 20.
The six added cases cover:

- rendered landmarks at 0°, 90°, 180°, and 270°;
- mixed 0°/90° pages and mixed raw page sizes;
- rotated text, checkbox, signature, whiteout, and mask placement through
  `/api/fill-pdf`;
- free watermark placement and clickable link geometry;
- clean Pro output; and
- desktop/mobile upload layout without horizontal overflow.

Run both the default-off and exact flag-on production builds. The flag-off
finalizer regression compares complete Pro and free output bytes with fixtures
generated directly by master commit `7beb21965fa6143482388d0da5cc04b020f0987f`.

## Known CropBox boundary

`createViewerSafePdfDocument` does not preserve CropBox geometry. In the
confirmed cropped 90° probe, the source pdf.js viewport was 400×300 while the
viewer-safe output became 600×400.

This is a separate, pre-existing geometry defect. This change intentionally
does not add CropBox copying, alter page embedding, swap MediaBox dimensions,
or change `src/lib/pdf-flatten-client.ts`. CropBox handling requires its own
fixture corpus and review.
