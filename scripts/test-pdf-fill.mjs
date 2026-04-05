/**
 * Test script: create a PDF with AcroForm text field containing newlines,
 * then run the same fill logic the API route uses to verify no WinAnsi error.
 */
import { PDFDocument, PDFName, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

// ── Step 1: Create a test PDF with an AcroForm text field whose value contains newlines ──

async function createTestPdf() {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([600, 400]);
  const form = pdfDoc.getForm();

  const tf = form.createTextField("test.field");
  tf.setText("Line one\nLine two\nLine three");
  tf.addToPage(page, { x: 50, y: 300, width: 200, height: 60 });

  const tf2 = form.createTextField("test.field2");
  tf2.setText("Second field\nwith newlines\nand more text");
  tf2.addToPage(page, { x: 50, y: 200, width: 200, height: 60 });

  return pdfDoc.save();
}

// ── Step 2: Run the same fill logic that the API route uses ──

function sanitize(text) {
  return text.replace(/[\x00-\x09\x0b-\x1f\x7f]/g, "");
}

async function fillTestPdf(pdfBytes) {
  const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });

  // Register fontkit
  pdfDoc.registerFontkit(fontkit);

  // Embed NotoSans
  const notoSansBytes = fs.readFileSync(
    path.join(projectRoot, "public/fonts/NotoSans-Regular.ttf")
  );
  const font = await pdfDoc.embedFont(notoSansBytes);

  const form = pdfDoc.getForm();
  const acroFields = form.getFields();

  // Build widget map (mirrors route.ts logic)
  const widgetMap = new Map();
  for (const af of acroFields) {
    const widgets = af.acroField.getWidgets();
    for (const widget of widgets) {
      const rect = widget.getRectangle();
      const pageRef = widget.P();
      let pageIndex = 0;
      if (pageRef) {
        const pages = pdfDoc.getPages();
        for (let i = 0; i < pages.length; i++) {
          if (pages[i].ref === pageRef) {
            pageIndex = i;
            break;
          }
        }
      }
      widgetMap.set(af.getName(), {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        pageIndex,
      });
    }
  }

  // Simulate drawing user values on each field
  for (const [name, widget] of widgetMap) {
    const page = pdfDoc.getPages()[widget.pageIndex];
    if (!page) continue;

    const testValue = `Filled value for ${name}\nWith a newline`;
    const fontSize = 10;

    // Draw multiline text (same as route.ts drawMultilineText)
    const lines = sanitize(testValue)
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .split("\n");
    const lineHeight = fontSize * 1.2;
    const startY = widget.y + widget.height - fontSize - 2;
    lines.forEach((line, i) => {
      const safeLine = line.replace(/[\x00-\x09\x0b-\x1f\x7f]/g, "");
      if (!safeLine) return;
      page.drawText(safeLine, {
        x: widget.x + 2,
        y: startY - i * lineHeight,
        size: fontSize,
        font,
        color: rgb(0, 0, 0),
      });
    });
  }

  // KEY FIX: Remove AcroForm from catalog to prevent WinAnsi encoding during save
  pdfDoc.catalog.delete(PDFName.of("AcroForm"));

  const result = await pdfDoc.save();
  return result;
}

// ── Run ──

console.log("Creating test PDF with AcroForm fields containing newlines...");
const testPdfBytes = await createTestPdf();
console.log(`  Created ${testPdfBytes.byteLength} byte test PDF`);

console.log("Filling PDF using server route logic (fontkit + NotoSans + catalog delete)...");
try {
  const filledBytes = await fillTestPdf(testPdfBytes);
  const outPath = path.join(projectRoot, "scripts/test-output.pdf");
  fs.writeFileSync(outPath, filledBytes);
  console.log(`  SUCCESS: Filled PDF saved to ${outPath} (${filledBytes.byteLength} bytes)`);
} catch (err) {
  console.error("  FAILED:", err.message);
  process.exit(1);
}

// Also verify fontkit registration works with NotoSans
console.log("Verifying fontkit + NotoSans embedding standalone...");
try {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const notoBytes = fs.readFileSync(
    path.join(projectRoot, "public/fonts/NotoSans-Regular.ttf")
  );
  const notoFont = await doc.embedFont(notoBytes);
  const page = doc.addPage();
  page.drawText("Unicode test: café résumé naïve 日本語", {
    x: 50,
    y: 700,
    size: 14,
    font: notoFont,
  });
  await doc.save();
  console.log("  SUCCESS: fontkit + NotoSans works correctly");
} catch (err) {
  console.error("  FAILED:", err.message);
  process.exit(1);
}

console.log("\nAll tests passed!");
