export type ToolType = "text" | "checkbox" | "signature" | "date" | "whiteout" | "comb";

export interface FieldBase {
  id: string;
  type: ToolType;
  x: number;
  y: number;
  width: number;
  height: number;
  page: number;
  snapped?: boolean;
  snapBounds?: { x: number; y: number; width: number; height: number };
}

export interface TextField extends FieldBase {
  type: "text";
  value: string;
  fontSize: number;
}

export type CheckboxStamp = "tick" | "cross" | "none";

export interface CheckboxField extends FieldBase {
  type: "checkbox";
  checked: boolean;
  stamp?: CheckboxStamp; // "tick" | "cross" | "none" (default "tick")
}

export interface SignatureField extends FieldBase {
  type: "signature";
  value: string;
  fontSize: number;
  /** Base64 PNG data URL of a drawn/saved signature */
  signatureDataUrl?: string;
}

export interface DateField extends FieldBase {
  type: "date";
  value: string;
  fontSize: number;
}

export interface WhiteoutField extends FieldBase {
  type: "whiteout";
  fillColor: string; // CSS hex or rgba, sampled from PDF background
}

export interface CombGroup {
  startIndex: number; // Index of first cell in this group (0-based)
  cellCount: number; // Number of cells in this group
  startX: number; // X position of first cell's left edge relative to field X (PDF points)
  totalWidth: number; // Total width of this group including all cells (PDF points)
}

export interface CombField extends FieldBase {
  type: "comb";
  value: string; // concatenated value of all cells
  charCount: number; // number of cells in the comb
  cursorIndex?: number; // persisted cursor position for re-selection
  cellWidth?: number; // manual cell width override for alignment with form boxes
  offsetX?: number; // horizontal offset for fine-tuning alignment (-20 to +20px)
  charOffsetX?: number; // character offset within each cell for centering (-10 to +10px)
  cellPositions?: number[]; // X positions of each cell center relative to field X (for non-uniform spacing)
  cellWidths?: number[]; // Width of each individual cell (for non-uniform spacing like TFN)
  groups?: CombGroup[]; // Cell groups with gaps between them (for date fields like DD MM YYYY)
}

export type EditorField = TextField | CheckboxField | SignatureField | DateField | WhiteoutField | CombField;

export interface AcroFormField {
  name: string;
  type: "text" | "checkbox";
  x: number;
  y: number;
  width: number;
  height: number;
  page: number;
  value: string;
}
