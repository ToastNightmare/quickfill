/**
 * Patches pdf-lib's WinAnsi encoder to return a space for unencodable
 * characters instead of throwing an error.
 * 
 * This runs as a postinstall script and at build time via vercel-build.
 * Fixes: "WinAnsi cannot encode \"\n\" (0x000a)"
 */

import { readFileSync, writeFileSync } from "fs";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

const files = [
  require.resolve("pdf-lib/dist/pdf-lib.js"),
  require.resolve("pdf-lib/dist/pdf-lib.esm.js"),
];

const MARKER = "/* __winansi_patched__ */";
const THROW_PATTERN = /var msg = _this\.name \+ " cannot encode[^}]+throw new Error\(msg\);/g;
const REPLACEMENT = `return { code: 0x20, name: "space" }; ${MARKER}`;

let patched = 0;
for (const file of files) {
  try {
    let src = readFileSync(file, "utf8");
    if (src.includes(MARKER)) {
      console.log(`[patch-pdf-lib] Already patched: ${file}`);
      continue;
    }
    const newSrc = src.replace(THROW_PATTERN, REPLACEMENT);
    if (newSrc === src) {
      console.warn(`[patch-pdf-lib] Pattern not found in: ${file}`);
      continue;
    }
    writeFileSync(file, newSrc);
    console.log(`[patch-pdf-lib] Patched: ${file}`);
    patched++;
  } catch (e) {
    console.error(`[patch-pdf-lib] Failed to patch ${file}:`, e.message);
  }
}

console.log(`[patch-pdf-lib] Done. ${patched} file(s) patched.`);
