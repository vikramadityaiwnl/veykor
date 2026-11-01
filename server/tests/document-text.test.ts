import { test } from "node:test";
import assert from "node:assert/strict";
import XLSX from "xlsx";
import { extractPdfText, extractSpreadsheetText } from "../src/chat/document-text.js";

function onePagePdf(text: string): Uint8Array {
  const stream = `BT /F1 14 Tf 20 150 Td (${text}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];

  objects.forEach((body, index) => {
    offsets.push(out.length);
    out += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;

  for (const offset of offsets) {
    out += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }

  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;

  return new TextEncoder().encode(out);
}

test("pdf text extraction returns page text and count", async () => {
  const pdf = await extractPdfText(onePagePdf("Muse PDF probe alpha bravo"));

  assert.equal(pdf.pages, 1);
  assert.match(pdf.text, /alpha bravo/);
});

test("spreadsheet extraction flattens sheets to csv", () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ["name", "role"],
      ["ada", "dev"],
    ]),
    "Team",
  );
  const bytes = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  const text = extractSpreadsheetText(bytes);

  assert.match(text, /## Team/);
  assert.match(text, /ada,dev/);
});

test("corrupt pdf bytes fail extraction instead of returning text", async () => {
  await assert.rejects(extractPdfText(new Uint8Array([1, 2, 3, 4])));
});
