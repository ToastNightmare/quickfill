import { describe, expect, it } from "@jest/globals";
import { createEditorFieldId, repairDuplicateEditorFieldIds, withUniqueEditorFieldId } from "../field-ids";
import type { EditorField } from "../types";

function field(id: string, type: EditorField["type"] = "text"): EditorField {
  const base = { id, x: 0, y: 0, width: 100, height: 20, page: 0 };

  if (type === "checkbox") return { ...base, type, checked: false };
  if (type === "whiteout") return { ...base, type, fillColor: "#ffffff" };
  if (type === "comb") return { ...base, type, value: "", charCount: 4 };
  return { ...base, type, value: "", fontSize: 14 };
}

describe("field IDs", () => {
  it("creates IDs that do not collide with existing fields", () => {
    const existing = [field("field-existing")];

    const id = createEditorFieldId(existing);

    expect(id).toMatch(/^field-/);
    expect(id).not.toBe("field-existing");
  });

  it("keeps a field ID when it is already unique", () => {
    const original = field("unique-field");

    expect(withUniqueEditorFieldId(original, [])).toBe(original);
  });

  it("assigns a new ID when adding a colliding field", () => {
    const original = field("shared-id", "signature");

    const repaired = withUniqueEditorFieldId(original, [field("shared-id")]);

    expect(repaired.id).toMatch(/^signature-/);
    expect(repaired.id).not.toBe("shared-id");
    expect(repaired.type).toBe("signature");
  });

  it("repairs duplicate restored fields without changing the first copy", () => {
    const restored = [
      field("shared-id", "text"),
      field("shared-id", "signature"),
      field("other-id", "checkbox"),
      field("other-id", "comb"),
    ];

    const repaired = repairDuplicateEditorFieldIds(restored);

    expect(repaired).toHaveLength(restored.length);
    expect(repaired[0]).toBe(restored[0]);
    expect(repaired[0].id).toBe("shared-id");
    expect(repaired[2]).toBe(restored[2]);
    expect(repaired[2].id).toBe("other-id");
    expect(new Set(repaired.map((item) => item.id)).size).toBe(restored.length);
    expect(repaired[1].id).toMatch(/^signature-/);
    expect(repaired[3].id).toMatch(/^comb-/);
  });

  it("creates unique IDs for rapid same-prefix generation", () => {
    const reserved: string[] = [];

    for (let i = 0; i < 250; i += 1) {
      const id = createEditorFieldId(reserved, "vis");
      reserved.push(id);
    }

    expect(new Set(reserved).size).toBe(reserved.length);
  });
});
