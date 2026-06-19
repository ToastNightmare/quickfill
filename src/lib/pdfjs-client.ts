type PdfjsClientModule = typeof import("pdfjs-dist/legacy/build/pdf.mjs");

const PDFJS_WORKER_SRC = "/pdf.worker.min.mjs";
const PDFJS_BUILD_URL = new URL("../../node_modules/pdfjs-dist/build/pdf.mjs", import.meta.url).href;
const PDFJS_LEGACY_BUILD_URL = new URL("../../node_modules/pdfjs-dist/legacy/build/pdf.mjs", import.meta.url).href;

let pdfjsClientPromise: Promise<PdfjsClientModule> | null = null;

async function importPdfjsClient(): Promise<PdfjsClientModule> {
  try {
    return await import(/* webpackIgnore: true */ PDFJS_BUILD_URL) as PdfjsClientModule;
  } catch (primaryError) {
    try {
      return await import(/* webpackIgnore: true */ PDFJS_LEGACY_BUILD_URL);
    } catch (legacyError) {
      throw new Error("Unable to load pdfjs-dist from build or legacy build paths.", {
        cause: { primaryError, legacyError },
      });
    }
  }
}

export async function loadPdfjsClient(): Promise<PdfjsClientModule> {
  pdfjsClientPromise ??= importPdfjsClient();

  const pdfjsClient = await pdfjsClientPromise;
  pdfjsClient.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_SRC;
  return pdfjsClient;
}
