# Add Media local rollout

Add Media is an internal, default-off browser-only capability. It is not part of
downloaded PDFs and must not be enabled publicly from this change.

## Exact rollout flag

The only enabled value is:

```text
NEXT_PUBLIC_QUICKFILL_ADD_MEDIA=local-v1
```

An unset flag, an empty value, or any other value is off. Because this is a
`NEXT_PUBLIC_` variable, Next.js fixes the value into the client bundle at build
time. Changing the runtime environment without rebuilding does not change the
rollout mode.

While off:

- `MediaEditorBoundary` returns its children directly.
- No media input, action, provider, timer, hash, object URL, telemetry, or
  persistence work is created.
- Fresh browsers create only the existing version-2 `quickfill_db` core stores.
- Browsers previously upgraded to version 3 open their current database version
  without a downgrade request and transact only against the two core stores.
- Existing media records are neither read nor removed.

## Local persistence contract

The enabled path upgrades `quickfill_db` to version 3 through
`src/lib/persistence.ts`, the sole owner of database opens, upgrades,
transactions, version-change handling, and closes.

Version 3 adds:

- `media_sessions`: one `current_media` manifest containing a versioned PDF
  digest, opaque incarnation, timestamp, monotonic write sequence, and ordered
  overlay geometry.
- `media_assets`: one content-addressed record per unique sanitized JPEG or PNG.

Only sanitized bytes are stored. SHA-256 identifies both the exact PDF bytes and
each sanitized media resource. A separate incarnation rotates on every
intentional replacement, so selecting the same PDF bytes again still clears old
media. Start Over, template replacement, ordinary replacement, append-page, and
remove-page invalidate media.

Core upload surfaces share the same persistence helper. In the exact feature-on
build, that helper saves the PDF and clears any prior media in one version-3
transaction. A constant, non-identifying core replacement-intent marker
prevents stale media from returning when a document was intentionally replaced
while the feature was off; the feature-on path consumes it when rotating the
media incarnation.

The manifest never stores filenames, original uploads, original bytes, object
URLs, canvases, image bitmaps, selection, Undo/Redo history, analytics data, or
download/export state. Overlay order is z-order. Runtime limits are 12 logical
overlays, 12 unique resources, and 64 MiB of sanitized bytes.

Hydration is all-or-nothing. It verifies the document binding, schema, resource
digests, JPEG/PNG signature and MIME agreement, metadata-free orientation-1
bytes, dimensions, limits, page number, scale-1 PDF.js page bounds, finite
geometry, aspect ratio, rotation, flips, and reference completeness before
creating any object URL. Invalid media is cleared without preventing the PDF or
ordinary fields from loading.

Writes are coalesced at 250 ms, latest-only, one transaction at a time, and
binding-checked inside the final transaction. Media-only expiry, mismatch, or
corruption clears media without deleting a recent valid PDF. A quota failure
runs orphan and age cleanup, retries once, keeps the in-session overlay on
repeated failure, and shows one generic warning.

## Privacy boundary

This rollout must not:

- upload media or contact a media/provider API;
- add media bytes, filenames, coordinates, transforms, document digests, or
  resource identifiers to analytics or logs;
- create a raw `File` object URL;
- add cloud storage or synchronization;
- change preview, download, export, embedding, authentication, or billing;
- enable Add Media in the public production build.

## Verification

Run both build modes. Do not count default-off skips as enabled coverage.

```bash
TMPDIR=/tmp TMP=/tmp TEMP=/tmp pnpm build
TMPDIR=/tmp TMP=/tmp TEMP=/tmp \
  QUICKFILL_STANDARD_QA=1 \
  PLAYWRIGHT_BASE_URL=http://localhost:3000 \
  pnpm exec playwright test tests/add-media-persistence.spec.ts --reporter=list

TMPDIR=/tmp TMP=/tmp TEMP=/tmp \
  NEXT_PUBLIC_QUICKFILL_ADD_MEDIA=local-v1 \
  pnpm build
TMPDIR=/tmp TMP=/tmp TEMP=/tmp \
  NEXT_PUBLIC_QUICKFILL_ADD_MEDIA=local-v1 \
  PLAYWRIGHT_BASE_URL=http://localhost:3000 \
  pnpm exec playwright test \
    tests/add-media-editor.spec.ts \
    tests/add-media-persistence.spec.ts \
    --reporter=list
```

Then rebuild default-off before the repository-wide `pnpm build`, `pnpm qa`,
`pnpm qa:clerk`, and enforced 20-test local PDF accuracy gate.

## Rollback

Build without `NEXT_PUBLIC_QUICKFILL_ADD_MEDIA=local-v1`. Version-3 databases
remain downgrade-safe, but the application performs no media-store work while
off. Do not delete user media records or downgrade the database as part of a
rollout rollback.
