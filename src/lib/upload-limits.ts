export const PDF_UPLOAD_MAX_MB = 15;
export const PDF_UPLOAD_MAX_BYTES = PDF_UPLOAD_MAX_MB * 1024 * 1024;
export const PDF_UPLOAD_MAX_LABEL = "15MB";
export const DOCUMENT_UPLOAD_LABEL = "PDF, JPG, or PNG";
export const DOCUMENT_FILE_INPUT_ACCEPT = "application/pdf,.pdf,image/jpeg,.jpg,.jpeg,image/png,.png";
export const IMAGE_CAPTURE_ACCEPT = "image/jpeg,image/png";
export const DOCUMENT_DROPZONE_ACCEPT = {
  "application/pdf": [".pdf"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
} as const;
