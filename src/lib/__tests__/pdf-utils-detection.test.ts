/**
 * @jest-environment node
 */

import { PDFDocument, StandardFonts } from "pdf-lib";
import { detectAcroFormFields } from "../pdf-utils";

const DOWNLOAD_PRESERVE_FLAG =
  "NEXT_PUBLIC_QUICKFILL_DOWNLOAD_PRESERVE";
const MOBILE_POLISH_FLAG =
  "NEXT_PUBLIC_QUICKFILL_MOBILE_POLISH";
const originalDownloadPreserveFlag =
  process.env[DOWNLOAD_PRESERVE_FLAG];
const originalMobilePolishFlag =
  process.env[MOBILE_POLISH_FLAG];

function asArrayBuffer(bytes: Uint8Array) {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

describe("detectAcroFormFields value seeding", () => {
  beforeEach(() => {
    process.env[DOWNLOAD_PRESERVE_FLAG] = "v1";
    delete process.env[MOBILE_POLISH_FLAG];
  });

  afterEach(() => {
    if (originalDownloadPreserveFlag === undefined) {
      delete process.env[DOWNLOAD_PRESERVE_FLAG];
    } else {
      process.env[DOWNLOAD_PRESERVE_FLAG] =
        originalDownloadPreserveFlag;
    }
    if (originalMobilePolishFlag === undefined) {
      delete process.env[MOBILE_POLISH_FLAG];
    } else {
      process.env[MOBILE_POLISH_FLAG] = originalMobilePolishFlag;
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

  it("emits one metadata-rich choice card per PDF field only for the exact mobile flag", async () => {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([500, 500]);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const form = pdfDoc.getForm();

    const radio = form.createRadioGroup("contact");
    for (const [index, option] of ["Email", "Phone", "Post", "None"].entries()) {
      radio.addOptionToPage(option, page, {
        x: 20 + index * 40,
        y: 390,
        width: 20,
        height: 20,
      });
    }
    radio.select("Phone");

    const dropdown = form.createDropdown("region");
    dropdown.setOptions(["North", "West"]);
    dropdown.select("West");
    dropdown.addToPage(page, {
      x: 20,
      y: 330,
      width: 120,
      height: 24,
      font,
    });

    const optionList = form.createOptionList("services");
    optionList.setOptions(["Support", "Training", "Hosting"]);
    optionList.enableMultiselect();
    optionList.select(["Support", "Hosting"]);
    optionList.addToPage(page, {
      x: 20,
      y: 240,
      width: 160,
      height: 60,
      font,
    });

    const sourceBytes = asArrayBuffer(await pdfDoc.save());
    const defaultFields = await detectAcroFormFields(sourceBytes);
    const defaultRadioFields = defaultFields.filter(
      (field) => field.name === "contact",
    );

    expect(defaultRadioFields).toHaveLength(4);
    expect(defaultRadioFields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "text" }),
      ]),
    );
    for (const field of defaultRadioFields) {
      expect(field).not.toHaveProperty("kind");
      expect(field).not.toHaveProperty("options");
    }

    process.env[MOBILE_POLISH_FLAG] = "v1";
    const mobileFields = await detectAcroFormFields(sourceBytes);
    const mobileRadioFields = mobileFields.filter(
      (field) => field.name === "contact",
    );

    expect(mobileRadioFields).toHaveLength(1);
    expect(mobileRadioFields[0]).toMatchObject({
      type: "text",
      kind: "radio",
      options: ["Email", "Phone", "Post", "None"],
      currentSelection: "Phone",
      value: "Phone",
      x: defaultRadioFields[0].x,
      y: defaultRadioFields[0].y,
      width: defaultRadioFields[0].width,
      height: defaultRadioFields[0].height,
    });
    expect(mobileFields.find((field) => field.name === "region")).toMatchObject({
      kind: "choice",
      options: ["North", "West"],
      currentSelection: "West",
      value: "West",
    });
    expect(mobileFields.find((field) => field.name === "services")).toMatchObject({
      kind: "choice",
      options: ["Support", "Training", "Hosting"],
      currentSelection: "Support, Hosting",
      multiselect: true,
    });
  });
});
