import type { EditorField, FieldLayerDirection } from "./types";

export type { FieldLayerDirection } from "./types";

function fieldLayerRank(field: EditorField) {
  return field.type === "whiteout" ? 0 : 1;
}

export function orderFieldsForLayering(fields: EditorField[]) {
  return fields
    .map((field, index) => ({ field, index }))
    .sort((a, b) => fieldLayerRank(a.field) - fieldLayerRank(b.field) || a.index - b.index)
    .map(({ field }) => field);
}

export function moveFieldInLayer(fields: EditorField[], fieldId: string, direction: FieldLayerDirection) {
  const ordered = orderFieldsForLayering(fields);
  const index = ordered.findIndex((field) => field.id === fieldId);
  if (index === -1) return ordered;

  const field = ordered[index];
  const rank = fieldLayerRank(field);
  const layerIndexes = ordered
    .map((item, itemIndex) => ({ item, itemIndex }))
    .filter(({ item }) => fieldLayerRank(item) === rank)
    .map(({ itemIndex }) => itemIndex);

  const positionInLayer = layerIndexes.indexOf(index);
  if (positionInLayer === -1) return ordered;

  const targetPosition =
    direction === "back"
      ? 0
      : direction === "front"
        ? layerIndexes.length - 1
        : direction === "backward"
          ? Math.max(0, positionInLayer - 1)
          : Math.min(layerIndexes.length - 1, positionInLayer + 1);

  if (targetPosition === positionInLayer) return ordered;

  const withoutField = ordered.filter((item) => item.id !== fieldId);
  const targetIndexInOriginal = layerIndexes[targetPosition];
  const insertBeforeId = ordered[targetIndexInOriginal]?.id;
  const insertIndex = insertBeforeId
    ? withoutField.findIndex((item) => item.id === insertBeforeId)
    : withoutField.length;

  const adjustedInsertIndex = direction === "front" || direction === "forward"
    ? insertIndex + (targetPosition > positionInLayer ? 1 : 0)
    : insertIndex;

  withoutField.splice(Math.max(0, adjustedInsertIndex), 0, field);
  return orderFieldsForLayering(withoutField);
}
