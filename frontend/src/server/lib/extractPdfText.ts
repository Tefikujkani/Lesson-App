import { extractText, getDocumentProxy } from "unpdf";

function parseDataUrl(dataUrl: string) {
  const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!matches) return null;
  return {
    mimeType: matches[1],
    base64Data: matches[2],
  };
}

export function isPdfUpload(mimeType?: string, fileName?: string) {
  return (
    mimeType === "application/pdf" ||
    Boolean(fileName && /\.pdf$/i.test(fileName))
  );
}

/** Extract plain text from a base64 PDF data URL using unpdf. */
export async function extractPdfTextFromDataUrl(dataUrl: string): Promise<string> {
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) {
    throw new Error("Invalid PDF data URL.");
  }

  const bytes = Buffer.from(parsed.base64Data, "base64");
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const result = await extractText(pdf, { mergePages: true });
  const raw = result.text;
  const text = Array.isArray(raw) ? raw.join("\n\n") : String(raw ?? "");

  return text.replace(/\u0000/g, "").trim();
}
