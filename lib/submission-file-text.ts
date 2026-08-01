import { readFile } from "fs/promises";

type SubmissionContextFile = {
  documentType?: string;
  originalName?: string;
  bytes?: Uint8Array;
  filePath?: string;
};

const maxTextPerFile = 30000;
const maxContextText = 120000;

export async function buildSubmissionHashtagContext(files: SubmissionContextFile[]) {
  const parts: string[] = [];

  for (const file of files) {
    const label = [documentTypeLabel(file.documentType), file.originalName].filter(Boolean).join(" ");
    const bytes = file.bytes ?? (file.filePath ? await readFile(file.filePath).catch(() => null) : null);
    const text = bytes ? await extractPdfText(bytes).catch(() => "") : "";
    const section = [label, text].filter(Boolean).join(" ");
    if (section.trim()) parts.push(section.trim());
  }

  return normalizeWhitespace(parts.join(" ")).slice(0, maxContextText);
}

async function extractPdfText(input: Uint8Array) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(input);
  const loadingTask = pdfjs.getDocument({
    data,
    disableFontFace: true,
    isEvalSupported: false,
    useSystemFonts: true,
  });
  const pdf = await loadingTask.promise;
  const pages: string[] = [];

  try {
    let collectedLength = 0;
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent({ includeMarkedContent: false });
      const pageText = content.items
        .map((item) => ("str" in item ? item.str : ""))
        .filter(Boolean)
        .join(" ");
      const normalizedPageText = normalizeWhitespace(pageText);
      if (normalizedPageText && collectedLength < maxTextPerFile) {
        const remaining = maxTextPerFile - collectedLength;
        const clippedPageText = normalizedPageText.slice(0, remaining);
        pages.push(`หน้า ${pageNumber} ${clippedPageText}`);
        collectedLength += clippedPageText.length;
      }
    }
  } finally {
    await pdf.destroy();
  }

  return normalizeWhitespace(pages.join(" ")).slice(0, maxTextPerFile);
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function documentTypeLabel(type?: string) {
  if (type === "ownership") return "เอกสารรับรองสิทธิ์";
  if (type === "concept") return "แนวคิดนวัตกรรม";
  if (type === "prototype") return "ต้นแบบหรือผลงาน";
  if (type === "implementation") return "การนำไปใช้และผลลัพธ์";
  return "";
}
