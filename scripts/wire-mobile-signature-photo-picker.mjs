import { readFileSync, writeFileSync } from "node:fs";

function normalize(text) {
  return text.replace(/\r\n/g, "\n");
}

function writeIfChanged(path, next) {
  const current = normalize(readFileSync(path, "utf8"));
  if (current !== next) writeFileSync(path, next);
}

function replaceOnce(text, search, replacement, label) {
  if (text.includes(replacement)) return text;
  if (!text.includes(search)) {
    throw new Error(`Missing mobile signature photo picker anchor (${label}): ${search.slice(0, 160)}`);
  }
  return text.replace(search, replacement);
}

const path = "src/components/SignatureModal.tsx";
let text = normalize(readFileSync(path, "utf8"));

text = replaceOnce(
  text,
  `const MAX_PHOTO_BYTES = 15 * 1024 * 1024;\nconst MAX_SOURCE_SIDE = 1800;\nconst MAX_SIGNATURE_DATA_URL_CHARS = 180_000;`,
  `const MAX_PHOTO_BYTES = 15 * 1024 * 1024;\nconst MAX_SOURCE_SIDE = 1800;\nconst MAX_SIGNATURE_DATA_URL_CHARS = 180_000;\nconst SUPPORTED_PHOTO_ACCEPT = "image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp";`,
  "photo accept constant",
);

text = replaceOnce(
  text,
  `function loadImage(file: File) {\n  return new Promise<HTMLImageElement>((resolve, reject) => {\n    const url = URL.createObjectURL(file);\n    const image = new Image();\n    image.onload = () => {\n      URL.revokeObjectURL(url);\n      resolve(image);\n    };\n    image.onerror = () => {\n      URL.revokeObjectURL(url);\n      reject(new Error("Could not read image"));\n    };\n    image.src = url;\n  });\n}`,
  `function isSignaturePhotoCandidate(file: File) {\n  const type = file.type.toLowerCase();\n  if (type.startsWith("image/")) return true;\n  return /\\.(jpe?g|png|webp)$/i.test(file.name);\n}\n\nfunction readFileAsDataUrl(file: File) {\n  return new Promise<string>((resolve, reject) => {\n    const reader = new FileReader();\n    reader.onload = () => {\n      if (typeof reader.result === "string") {\n        resolve(reader.result);\n      } else {\n        reject(new Error("Could not read image"));\n      }\n    };\n    reader.onerror = () => reject(new Error("Could not read image"));\n    reader.readAsDataURL(file);\n  });\n}\n\nfunction decodeImageSource(src: string, cleanup?: () => void) {\n  return new Promise<HTMLImageElement>((resolve, reject) => {\n    const image = new Image();\n    image.decoding = "async";\n    image.onload = () => {\n      cleanup?.();\n      resolve(image);\n    };\n    image.onerror = () => {\n      cleanup?.();\n      reject(new Error("Could not read image"));\n    };\n    image.src = src;\n  });\n}\n\nasync function loadImage(file: File) {\n  const url = URL.createObjectURL(file);\n  try {\n    return await decodeImageSource(url, () => URL.revokeObjectURL(url));\n  } catch {\n    const dataUrl = await readFileAsDataUrl(file);\n    return decodeImageSource(dataUrl);\n  }\n}`,
  "image decode fallback",
);

text = replaceOnce(
  text,
  `async function processSignaturePhoto(file: File) {\n  if (!file.type.startsWith("image/")) {\n    throw new Error("Choose an image file");\n  }`,
  `async function processSignaturePhoto(file: File) {\n  if (!isSignaturePhotoCandidate(file)) {\n    throw new Error("Choose an image file");\n  }`,
  "file type fallback",
);

text = replaceOnce(
  text,
  `  return shrinkPngDataUrl(finalCanvas);\n}\n\nexport function SignatureModal({`,
  `  return shrinkPngDataUrl(finalCanvas);\n}\n\nfunction getPhotoErrorMessage(error: unknown) {\n  const message = error instanceof Error ? error.message : "";\n  if (message === "Choose an image file") {\n    return "Choose a JPG, PNG, or WebP image from Camera, Gallery, or Files.";\n  }\n  if (message === "Could not read image") {\n    return "We couldn't read that photo. If it came from Photos, save it to your phone or Files first, then choose it again.";\n  }\n  return message || "Could not use image. Try Camera, or choose a saved JPG/PNG from Files.";\n}\n\nexport function SignatureModal({`,
  "friendly photo errors",
);

text = replaceOnce(
  text,
  `      setPhotoError(error instanceof Error ? error.message : "Could not use image");`,
  `      setPhotoError(getPhotoErrorMessage(error));`,
  "use friendly photo errors",
);

text = replaceOnce(
  text,
  `                  <input\n                    ref={fileInputRef}\n                    type="file"\n                    accept="image/*"\n                    className="hidden"\n                    onClick={(event) => { event.currentTarget.value = ""; }}\n                    onChange={(event) => handlePhotoFile(event.target.files?.[0])}\n                  />`,
  `                  <input\n                    ref={fileInputRef}\n                    type="file"\n                    accept={SUPPORTED_PHOTO_ACCEPT}\n                    className="hidden"\n                    onClick={(event) => { event.currentTarget.value = ""; }}\n                    onChange={(event) => handlePhotoFile(event.target.files?.[0])}\n                  />`,
  "gallery supported formats",
);

text = replaceOnce(
  text,
  `                            <ImagePlus className="h-4 w-4" />\n                            Choose Image`,
  `                            <ImagePlus className="h-4 w-4" />\n                            Gallery / Files`,
  "gallery files label",
);

text = replaceOnce(
  text,
  `                        </div>\n                      </div>\n                    )}`, 
  `                        </div>\n                        <p className="text-center text-xs leading-relaxed text-text-muted">\n                          If Photos cannot load the edited image, use Camera or save it to Files first.\n                        </p>\n                      </div>\n                    )}`,
  "photos fallback note",
);

writeIfChanged(path, text);
