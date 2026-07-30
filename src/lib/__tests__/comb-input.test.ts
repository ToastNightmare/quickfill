import {
  backspaceCombCharacter,
  getCombCursorIndex,
  insertCombCharacter,
  moveCombCursor,
} from "../comb-input";

describe("comb input helpers", () => {
  test("inserts at the cursor and advances", () => {
    expect(insertCombCharacter("", 4, undefined, "A")).toEqual({
      value: "A   ",
      cursorIndex: 1,
    });
    expect(insertCombCharacter("A   ", 4, 1, "Z")).toEqual({
      value: "AZ  ",
      cursorIndex: 2,
    });
  });

  test("clears the preceding slot and steps back", () => {
    expect(backspaceCombCharacter("AB  ", 4, 2)).toEqual({
      value: "A   ",
      cursorIndex: 1,
    });
    expect(backspaceCombCharacter("A   ", 4, 0)).toEqual({
      value: "    ",
      cursorIndex: 0,
    });
  });

  test("moves left and right within the field bounds", () => {
    expect(moveCombCursor("AB  ", 4, 0, "left")).toBe(0);
    expect(moveCombCursor("AB  ", 4, 1, "right")).toBe(2);
    expect(moveCombCursor("AB  ", 4, 3, "right")).toBe(3);
  });

  test("derives and clamps cursor bounds", () => {
    expect(getCombCursorIndex("AB  ", 4)).toBe(2);
    expect(getCombCursorIndex("AB  ", 4, -10)).toBe(0);
    expect(getCombCursorIndex("AB  ", 4, 10)).toBe(3);
    expect(getCombCursorIndex("", 0, 10)).toBe(0);
  });
});
