import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { VerbosityLevel, getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import XLSX from "xlsx";

export interface ExtractedDocument {
  text: string;
  pages: number;
}

function cap(value: string): string {
  return value.length > 30_000
    ? `${value.slice(0, 30_000)}\n[truncated]`
    : value;
}

function fontDataUrl(): string {
  const root = dirname(
    createRequire(import.meta.url).resolve("pdfjs-dist/package.json"),
  );

  return `${pathToFileURL(join(root, "standard_fonts")).href}/`;
}

export async function extractPdfText(
  bytes: Uint8Array,
): Promise<ExtractedDocument> {
  const pdf = await getDocument({
    data: bytes,
    useWorkerFetch: false,
    standardFontDataUrl: fontDataUrl(),
    verbosity: VerbosityLevel.ERRORS,
  }).promise;
  const pages = pdf.numPages;
  const parts: string[] = [];

  try {
    for (let number = 1; number <= Math.min(pages, 50); number += 1) {
      const page = await pdf.getPage(number);
      const content = await page.getTextContent();
      const line = content.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();

      if (line) {
        parts.push(line);
      }
    }
  } finally {
    await pdf.cleanup();
  }

  return { text: cap(parts.join("\n")), pages };
}

export function extractSpreadsheetText(bytes: Uint8Array): string {
  const workbook = XLSX.read(bytes, { type: "array" });
  const parts: string[] = [];

  for (const name of workbook.SheetNames.slice(0, 20)) {
    const csv = XLSX.utils.sheet_to_csv(workbook.Sheets[name]).trim();

    if (csv) {
      parts.push(`## ${name}\n${csv}`);
    }
  }

  return cap(parts.join("\n\n"));
}
