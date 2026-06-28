export type ToolType =
  | "select"
  | "text"
  | "date"
  | "checkbox"
  | "signature"
  | "box"
  | "whiteout"
  | "line"
  | "mask-eraser"
  | "eraser";
export type PlacementToolType = Extract<ToolType, "text" | "date" | "checkbox" | "signature" | "box" | "whiteout" | "line">;
export type FieldType = Exclude<PlacementToolType, "box"> | "comb";
export type FieldLayerDirection = "back" | "backward" | "forward" | "front";
export type LineOrientation = "horizontal" | "vertical";

export interface ToolDefaultState {
  select: Record<string, never>;
  text: {
    fontSize: number;
  };
  date: {
    fontSize: number;
    format: "en-AU";
  };
  checkbox: {
    stamp: CheckboxStamp;
    color: string;
    size: number;
  };
  signature: {
    fontSize: number;
  };
  box: {
    charCount: number;
  };
  whiteout: {
    fillColor: string | null;
  };
  line: {
    strokeWidth: number;
    color: string;
    orientation: LineOrientation;
  };
  eraser: {
    size: number; // eraser brush size in screen pixels: 24 (small), 48 (medium), 96 (large)
  };
  "mask-eraser": Record<string, never>;
}

export interface MaskRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FieldBase {
  id: string;
  type: FieldType;
  x: number;
  y: number;
  width: number;
  height: number;
  page: number;
  snapped?: boolean;
  snapBounds?: { x: number; y: number; width: number; height: number };
  eraseMasks?: MaskRect[];
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
  color?: string; // Hex color, defaults to near-black when absent
}

export interface LineField extends FieldBase {
  type: "line";
  orientation: LineOrientation;
  color: string;
  strokeWidth: number;
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

export type EditorField = TextField | CheckboxField | SignatureField | DateField | WhiteoutField | CombField | LineField;

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
