export interface CombValueUpdate {
  value: string;
  cursorIndex: number;
}

function normalizeCharCount(charCount: number): number {
  return Math.max(1, Math.floor(charCount) || 1);
}

export function getCombCursorIndex(
  value: string,
  charCount: number,
  cursorIndex?: number,
): number {
  const lastIndex = normalizeCharCount(charCount) - 1;
  const fallbackIndex = Math.min(value.replace(/ +$/, "").length, lastIndex);
  return Math.min(
    Math.max(cursorIndex ?? fallbackIndex, 0),
    lastIndex,
  );
}

export function insertCombCharacter(
  value: string,
  charCount: number,
  cursorIndex: number | undefined,
  character: string,
): CombValueUpdate {
  const normalizedCharCount = normalizeCharCount(charCount);
  const currentIndex = getCombCursorIndex(
    value,
    normalizedCharCount,
    cursorIndex,
  );
  const nextCharacter = character.slice(0, 1);
  if (!nextCharacter) {
    return { value, cursorIndex: currentIndex };
  }

  const paddedValue = value.padEnd(normalizedCharCount, " ");
  return {
    value:
      paddedValue.slice(0, currentIndex) +
      nextCharacter +
      paddedValue.slice(currentIndex + 1),
    cursorIndex: Math.min(currentIndex + 1, normalizedCharCount - 1),
  };
}

export function backspaceCombCharacter(
  value: string,
  charCount: number,
  cursorIndex?: number,
): CombValueUpdate {
  const normalizedCharCount = normalizeCharCount(charCount);
  const currentIndex = getCombCursorIndex(
    value,
    normalizedCharCount,
    cursorIndex,
  );
  const targetIndex = currentIndex > 0 ? currentIndex - 1 : 0;
  const paddedValue = value.padEnd(normalizedCharCount, " ");

  return {
    value:
      paddedValue.slice(0, targetIndex) +
      " " +
      paddedValue.slice(targetIndex + 1),
    cursorIndex: targetIndex,
  };
}

export function moveCombCursor(
  value: string,
  charCount: number,
  cursorIndex: number | undefined,
  direction: "left" | "right",
): number {
  const normalizedCharCount = normalizeCharCount(charCount);
  const currentIndex = getCombCursorIndex(
    value,
    normalizedCharCount,
    cursorIndex,
  );

  return direction === "left"
    ? Math.max(currentIndex - 1, 0)
    : Math.min(currentIndex + 1, normalizedCharCount - 1);
}
