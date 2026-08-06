import type { EditorField } from "../types";
import { __historyTestUtils } from "../use-history";

const { reducer } = __historyTestUtils;

function textField(id: string, value: string): EditorField {
  return {
    id,
    type: "text",
    x: 10,
    y: 10,
    width: 100,
    height: 20,
    page: 0,
    value,
    fontSize: 12,
  };
}

function whiteoutField(id: string): EditorField {
  return {
    id,
    type: "whiteout",
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    page: 0,
    fillColor: "#ffffff",
  };
}

function markNormalized(fields: EditorField[]): EditorField[] {
  return fields
    .map((field) =>
      field.type === "text"
        ? { ...field, value: `normalized:${field.value}` }
        : field,
    )
    .reverse();
}

describe("useHistory NORMALIZE", () => {
  it("normalizes every snapshot without changing stack lengths or clearing future", () => {
    const state = {
      past: [
        [textField("past-1", "one")],
        [textField("past-2", "two")],
      ],
      present: [textField("present", "three")],
      future: [
        [textField("future-1", "four")],
        [textField("future-2", "five")],
      ],
    };

    const normalized = reducer(state, {
      type: "NORMALIZE",
      transform: markNormalized,
    });

    expect(normalized.past).toHaveLength(state.past.length);
    expect(normalized.future).toHaveLength(state.future.length);
    expect(normalized.past.map((snapshot) => snapshot[0])).toEqual([
      expect.objectContaining({ value: "normalized:one" }),
      expect.objectContaining({ value: "normalized:two" }),
    ]);
    expect(normalized.present[0]).toEqual(
      expect.objectContaining({ value: "normalized:three" }),
    );
    expect(normalized.future.map((snapshot) => snapshot[0])).toEqual([
      expect.objectContaining({ value: "normalized:four" }),
      expect.objectContaining({ value: "normalized:five" }),
    ]);
  });

  it("keeps the normalization across undo and redo", () => {
    const normalized = reducer(
      {
        past: [[textField("field", "before")]],
        present: [textField("field", "current")],
        future: [[textField("field", "after")]],
      },
      { type: "NORMALIZE", transform: markNormalized },
    );

    const undone = reducer(normalized, { type: "UNDO" });
    expect(undone.present[0]).toEqual(
      expect.objectContaining({ value: "normalized:before" }),
    );

    const redone = reducer(undone, { type: "REDO" });
    expect(redone.present[0]).toEqual(
      expect.objectContaining({ value: "normalized:current" }),
    );
    expect(redone.future).toEqual(normalized.future);
  });

  it("reapplies field-layer ordering to every transformed snapshot", () => {
    const normalized = reducer(
      {
        past: [[whiteoutField("past-mask"), textField("past-text", "past")]],
        present: [whiteoutField("present-mask"), textField("present-text", "present")],
        future: [[whiteoutField("future-mask"), textField("future-text", "future")]],
      },
      { type: "NORMALIZE", transform: markNormalized },
    );

    expect(normalized.past[0].map((field) => field.id)).toEqual([
      "past-mask",
      "past-text",
    ]);
    expect(normalized.present.map((field) => field.id)).toEqual([
      "present-mask",
      "present-text",
    ]);
    expect(normalized.future[0].map((field) => field.id)).toEqual([
      "future-mask",
      "future-text",
    ]);
  });

  it("leaves MAX_HISTORY trimming unchanged", () => {
    let state = {
      past: [] as EditorField[][],
      present: [textField("field", "0")],
      future: [] as EditorField[][],
    };

    for (let index = 1; index <= 60; index += 1) {
      state = reducer(state, {
        type: "SET",
        updater: [textField("field", String(index))],
      });
    }
    expect(state.past).toHaveLength(50);

    const normalized = reducer(state, {
      type: "NORMALIZE",
      transform: markNormalized,
    });
    expect(normalized.past).toHaveLength(50);

    const next = reducer(normalized, {
      type: "SET",
      updater: [textField("field", "next")],
    });
    expect(next.past).toHaveLength(50);
  });
});
