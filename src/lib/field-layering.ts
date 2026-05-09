import type { EditorField } from "./types";

const FIELD_LAYER_RANK: Record<EditorField["type"], number> = {
  whiteout: 0,
  text: 1,
  date: 1,
  comb: 1,
  checkbox: 2,
  signature: 3,
};

export function orderFieldsForLayering(fields: EditorField[]) {
  return fields
    .map((field, index) => ({ field, index }))
    .sort(
      (a, b) =>
        FIELD_LAYER_RANK[a.field.type] - FIELD_LAYER_RANK[b.field.type] ||
        a.index - b.index,
    )
    .map(({ field }) => field);
}
