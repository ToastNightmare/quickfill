import {
  LocalMediaAssetRegistry,
  MEDIA_EDITOR_MAX_ASSETS,
  createCenteredMediaPlacement,
  createMediaAssetDescriptor,
  keepMediaPlacementWithinPage,
  localMediaAssetIdFromString,
  mediaPlacementsEqual,
  pageDeltaFromViewportDelta,
  resizeMediaPlacementFromCenter,
  sanitizedMediaFileName,
} from "@/lib/media-editor";
import {
  MEDIA_EDITOR_MAX_HISTORY,
  createMediaEditorHistoryState,
  freezeMediaOverlay,
  mediaEditorHistoryReducer,
} from "@/lib/media-editor-history";
import { resolveMediaTransform } from "@/lib/media-transform";
import type {
  LocalMediaAssetId,
  MediaOverlayState,
} from "@/lib/media-types";

function descriptor(id = "media-test-1") {
  return createMediaAssetDescriptor({
    id: localMediaAssetIdFromString(id),
    sourceFileName: "../holiday.webp",
    mimeType: "image/png",
    width: 400,
    height: 200,
  });
}

function overlay(
  id = "media-test-1",
  xPts = 10,
): Readonly<MediaOverlayState> {
  return freezeMediaOverlay({
    assetId: localMediaAssetIdFromString(id),
    placement: {
      pageIndex: 0,
      xPts,
      yPts: 20,
      widthPts: 200,
      heightPts: 100,
    },
    transform: {
      rotationDeg: 0,
      flipX: false,
      flipY: false,
    },
  });
}

describe("local media descriptors and registry", () => {
  it("normalizes source names to the sanitized output format", () => {
    expect(sanitizedMediaFileName("../../unsafe:name.WEBP", "image/jpeg")).toBe(
      "unsafe-name.jpg",
    );
    expect(sanitizedMediaFileName("\u0000...", "image/png")).toBe("media.png");
    expect(descriptor()).toMatchObject({
      kind: "image",
      fileName: "holiday.png",
      mimeType: "image/png",
      intrinsicWidthPx: 400,
      intrinsicHeightPx: 200,
    });
  });

  it("rejects malformed ids and descriptors before creating an object URL", () => {
    expect(() => localMediaAssetIdFromString("bad id")).toThrow();
    const urlApi = {
      createObjectURL: jest.fn(() => "blob:should-not-exist"),
      revokeObjectURL: jest.fn(),
    };
    const registry = new LocalMediaAssetRegistry(urlApi);
    const invalid = {
      ...descriptor(),
      mimeType: "image/webp",
    };
    expect(() =>
      registry.add(
        invalid as unknown as ReturnType<typeof descriptor>,
        new Blob(["safe"], { type: "image/webp" }),
      ),
    ).toThrow();
    expect(urlApi.createObjectURL).not.toHaveBeenCalled();
  });

  it("bounds assets and revokes each sanitized object URL exactly once", () => {
    let nextUrl = 0;
    const urlApi = {
      createObjectURL: jest.fn(() => `blob:sanitized-${++nextUrl}`),
      revokeObjectURL: jest.fn(),
    };
    const registry = new LocalMediaAssetRegistry(urlApi, 2);
    const first = descriptor("media-first");
    const second = descriptor("media-second");
    const firstBlob = new Blob(["first"], { type: "image/png" });
    const secondBlob = new Blob(["second"], { type: "image/png" });

    expect(registry.add(first, firstBlob).blob).toBe(firstBlob);
    expect(registry.add(second, secondBlob).objectUrl).toBe("blob:sanitized-2");
    expect(registry.size).toBe(2);
    expect(() =>
      registry.add(
        descriptor("media-third"),
        new Blob(["third"], { type: "image/png" }),
      ),
    ).toThrow(/full/);
    expect(urlApi.createObjectURL).toHaveBeenCalledTimes(2);

    expect(registry.release(first.id)).toBe(true);
    expect(registry.release(first.id)).toBe(false);
    registry.clear();
    expect(urlApi.revokeObjectURL.mock.calls).toEqual([
      ["blob:sanitized-1"],
      ["blob:sanitized-2"],
    ]);
    expect(registry.size).toBe(0);
  });

  it("uses the approved bounded registry capacity", () => {
    const registry = new LocalMediaAssetRegistry({
      createObjectURL: () => "blob:test",
      revokeObjectURL: () => undefined,
    });
    expect(registry.capacity).toBe(MEDIA_EDITOR_MAX_ASSETS);
  });
});

describe("media placement geometry", () => {
  const page = { widthPts: 600, heightPts: 800 };

  it("centers an aspect-preserving default placement within the page", () => {
    const placement = createCenteredMediaPlacement(descriptor(), 2, page);
    expect(placement).toEqual({
      pageIndex: 2,
      xPts: 120,
      yPts: 310,
      widthPts: 360,
      heightPts: 180,
    });
    expect(placement.widthPts / placement.heightPts).toBe(2);
  });

  it("keeps moved and rotated media fully inside page bounds", () => {
    const transform = { rotationDeg: 45, flipX: false, flipY: false };
    const placement = keepMediaPlacementWithinPage(
      {
        pageIndex: 0,
        xPts: -500,
        yPts: 700,
        widthPts: 700,
        heightPts: 400,
      },
      transform,
      page,
    );
    const corners = resolveMediaTransform(placement, transform).pageCorners;
    expect(Math.min(...corners.map(({ x }) => x))).toBeGreaterThanOrEqual(-1e-9);
    expect(Math.max(...corners.map(({ x }) => x))).toBeLessThanOrEqual(
      page.widthPts + 1e-9,
    );
    expect(Math.min(...corners.map(({ y }) => y))).toBeGreaterThanOrEqual(-1e-9);
    expect(Math.max(...corners.map(({ y }) => y))).toBeLessThanOrEqual(
      page.heightPts + 1e-9,
    );
  });

  it("resizes from the centre with a fixed aspect ratio and minimum size", () => {
    const start = createCenteredMediaPlacement(descriptor(), 0, page);
    const resized = resizeMediaPlacementFromCenter(
      start,
      { rotationDeg: 90, flipX: true, flipY: false },
      0.001,
      page,
    );
    expect(resized.widthPts / resized.heightPts).toBeCloseTo(2);
    expect(resized.widthPts).toBeGreaterThanOrEqual(24);
    expect(resized.heightPts).toBeGreaterThanOrEqual(24);
  });

  it("maps viewport movement through the inverse affine contract", () => {
    expect(
      pageDeltaFromViewportDelta([2, 0, 0, 4, 20, 30], 40, -20),
    ).toEqual({ xPts: 20, yPts: -5 });
    expect(
      mediaPlacementsEqual(
        {
          pageIndex: 0,
          xPts: 1,
          yPts: 2,
          widthPts: 3,
          heightPts: 4,
        },
        {
          pageIndex: 0,
          xPts: 1,
          yPts: 2,
          widthPts: 3,
          heightPts: 4,
        },
      ),
    ).toBe(true);
  });
});

describe("bounded media transform history", () => {
  it("undoes and redoes transform commits without treating intake as undoable", () => {
    const added = mediaEditorHistoryReducer(createMediaEditorHistoryState(), {
      type: "ADD",
      overlay: overlay(),
    });
    expect(added.past).toHaveLength(0);

    const rotated = mediaEditorHistoryReducer(added, {
      type: "COMMIT",
      overlay: freezeMediaOverlay({
        ...added.present[0],
        transform: {
          ...added.present[0].transform,
          rotationDeg: 90,
        },
      }),
    });
    expect(rotated.past).toHaveLength(1);
    expect(rotated.present[0].transform.rotationDeg).toBe(90);

    const undone = mediaEditorHistoryReducer(rotated, { type: "UNDO" });
    expect(undone.present[0].transform.rotationDeg).toBe(0);
    const redone = mediaEditorHistoryReducer(undone, { type: "REDO" });
    expect(redone.present[0].transform.rotationDeg).toBe(90);
  });

  it("removes a deleted asset from every reachable history frame", () => {
    let state = mediaEditorHistoryReducer(createMediaEditorHistoryState(), {
      type: "ADD",
      overlay: overlay(),
    });
    state = mediaEditorHistoryReducer(state, {
      type: "COMMIT",
      overlay: freezeMediaOverlay({
        ...state.present[0],
        placement: { ...state.present[0].placement, xPts: 80 },
      }),
    });
    state = mediaEditorHistoryReducer(state, { type: "UNDO" });
    state = mediaEditorHistoryReducer(state, {
      type: "DELETE",
      assetId: localMediaAssetIdFromString("media-test-1"),
    });

    expect(state.present).toHaveLength(0);
    expect(state.past).toHaveLength(0);
    expect(state.future).toHaveLength(0);
    expect(state.selectedAssetId).toBeNull();
  });

  it("does not expose no-op Undo frames after terminal deletion and later intake", () => {
    let state = mediaEditorHistoryReducer(createMediaEditorHistoryState(), {
      type: "ADD",
      overlay: overlay("media-first"),
    });
    state = mediaEditorHistoryReducer(state, {
      type: "COMMIT",
      overlay: overlay("media-first", 80),
    });
    state = mediaEditorHistoryReducer(state, {
      type: "DELETE",
      assetId: localMediaAssetIdFromString("media-first"),
    });
    state = mediaEditorHistoryReducer(state, {
      type: "ADD",
      overlay: overlay("media-second"),
    });

    expect(state.past).toHaveLength(0);
    expect(mediaEditorHistoryReducer(state, { type: "UNDO" })).toBe(state);
    expect(state.future).toHaveLength(0);
  });

  it("caps transform history at fifty immutable frames", () => {
    let state = mediaEditorHistoryReducer(createMediaEditorHistoryState(), {
      type: "ADD",
      overlay: overlay(),
    });
    for (let index = 0; index < MEDIA_EDITOR_MAX_HISTORY + 8; index += 1) {
      state = mediaEditorHistoryReducer(state, {
        type: "COMMIT",
        overlay: overlay("media-test-1", 11 + index),
      });
    }
    expect(state.past).toHaveLength(MEDIA_EDITOR_MAX_HISTORY);
    expect(Object.isFrozen(state.present)).toBe(true);
  });

  it("keeps a later asset present across earlier transform history", () => {
    let state = mediaEditorHistoryReducer(createMediaEditorHistoryState(), {
      type: "ADD",
      overlay: overlay("media-first"),
    });
    state = mediaEditorHistoryReducer(state, {
      type: "COMMIT",
      overlay: overlay("media-first", 50),
    });
    state = mediaEditorHistoryReducer(state, {
      type: "ADD",
      overlay: overlay("media-second"),
    });
    state = mediaEditorHistoryReducer(state, { type: "UNDO" });
    expect(state.present.map(({ assetId }) => assetId)).toEqual([
      "media-first" as LocalMediaAssetId,
      "media-second" as LocalMediaAssetId,
    ]);
  });
});
