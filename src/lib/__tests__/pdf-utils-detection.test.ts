/**
 * @jest-environment node
 */

import { PDFDocument, StandardFonts } from "pdf-lib";
import { detectAcroFormFields } from "../pdf-utils";

const DOWNLOAD_PRESERVE_FLAG =
  "NEXT_PUBLIC_QUICKFILL_DOWNLOAD_PRESERVE";
const originalDownloadPreserveFlag =
  process.env[DOWNLOAD_PRESERVE_FLAG];

function asArrayBuffer(bytes: Uint8Array) {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

describe("detectAcroFormFields value seeding", () => {
  beforeEach(() => {
    process.env[DOWNLOAD_PRESERVE_FLAG] = "v1";
  });

  afterEach(() => {
    if (originalDownloadPreserveFlag === undefined) {
      delete process.env[DOWNLOAD_PRESERVE_FLAG];
    } else {
      process.env[DOWNLOAD_PRESERVE_FLAG] =
        originalDownloadPreserveFlag;
    }
  });

  it("reads text, checkbox, dropdown, radio, and option-list state without changing UI types", async () => {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([500, 500]);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const form = pdfDoc.getForm();

    const text = form.createTextField("fullName");
    text.addToPage(page, { x: 20, y: 430, width: 160, height: 24, font });
    text.setText("Existing name");

    const checkbox = form.createCheckBox("confirmed");
    checkbox.addToPage(page, { x: 20, y: 390, width: 20, height: 20 });
    checkbox.check();

    const dropdown = form.createDropdown("region");
    dropdown.setOptions(["North", "West"]);
    dropdown.select("West");
    dropdown.addToPage(page, { x: 20, y: 340, width: 120, height: 24, font });

    const radio = form.createRadioGroup("contact");
    radio.addOptionToPage("Email", page, {
      x: 20,
      y: 300,
      width: 20,
      height: 20,
    });
    radio.addOptionToPage("Phone", page, {
      x: 60,
      y: 300,
      width: 20,
      height: 20,
    });
    radio.select("Phone");

    const optionList = form.createOptionList("services");
    optionList.setOptions(["Support", "Training", "Hosting"]);
    optionList.enableMultiselect();
    optionList.select(["Support", "Hosting"]);
    optionList.addToPage(page, {
      x: 20,
      y: 220,
      width: 160,
      height: 60,
      font,
    });

    const sourceBytes = asArrayBuffer(await pdfDoc.save());
    const fields = await detectAcroFormFields(sourceBytes);
    const byName = (name: string) =>
      fields.find((field) => field.name === name);

    expect(byName("fullName")).toMatchObject({
      type: "text",
      value: "Existing name",
      valueSource: "text",
    });
    expect(byName("confirmed")).toMatchObject({
      type: "checkbox",
      checked: true,
      valueSource: "none",
    });
    expect(byName("region")).toMatchObject({
      type: "text",
      value: "West",
      valueSource: "choice",
    });
    expect(byName("contact")).toMatchObject({
      type: "text",
      value: "Phone",
      valueSource: "choice",
    });
    expect(byName("services")).toMatchObject({
      type: "text",
      value: "Support, Hosting",
      valueSource: "choice",
    });

    process.env[DOWNLOAD_PRESERVE_FLAG] = "true";
    const defaultFields = await detectAcroFormFields(sourceBytes);
    const defaultByName = (name: string) =>
      defaultFields.find((field) => field.name === name);

    expect(defaultByName("fullName")).toMatchObject({
      type: "text",
      value: "Existing name",
    });
    expect(defaultByName("confirmed")).toMatchObject({
      type: "checkbox",
      value: "",
    });
    expect(defaultByName("confirmed")).not.toHaveProperty("checked");
    expect(defaultByName("region")).toMatchObject({
      type: "text",
      value: "",
    });
    expect(defaultByName("region")).not.toHaveProperty("valueSource");
  });
});
