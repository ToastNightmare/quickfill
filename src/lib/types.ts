export type ToolType = "text" | "checkbox" | "signature" | "date" | "whiteout" | "grid";

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

export interface GridField extends FieldBase {
  type: "grid";
  value: string; // concatenated value of all slots
  charCount: number; // number of character slots
  slotWidth?: number; // optional: width of individual slot
  slotHeight?: number; // optional: height of individual slot
}

export type EditorField = TextField | CheckboxField | SignatureField | DateField | WhiteoutField | GridField;

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
