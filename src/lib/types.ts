export type ToolType = "text" | "checkbox" | "signature" | "date";

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

export type EditorField = TextField | CheckboxField | SignatureField | DateField;

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
