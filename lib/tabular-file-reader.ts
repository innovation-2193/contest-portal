import { inflateRawSync } from "zlib";

type ZipEntry = {
  name: string;
  method: number;
  compressedSize: number;
  localOffset: number;
};

export async function parseTabularFileRows(file: File, options: { label: string; maxBytes?: number }) {
  if (!file || file.size < 1) throw new Error(`กรุณาแนบไฟล์${options.label}`);
  if (options.maxBytes && file.size > options.maxBytes) {
    throw new Error(`ไฟล์${options.label}ขนาดใหญ่เกินไป กรุณาใช้ไฟล์ไม่เกิน ${Math.floor(options.maxBytes / 1024 / 1024).toLocaleString("th-TH")} MB`);
  }

  const name = file.name.toLowerCase();
  const buffer = Buffer.from(await file.arrayBuffer());
  if (name.endsWith(".csv")) return parseCsvRows(buffer.toString("utf8"));
  if (name.endsWith(".xlsx")) return parseXlsxRows(buffer);
  throw new Error("รองรับเฉพาะไฟล์ .xlsx หรือ .csv เท่านั้น");
}

function parseCsvRows(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (quoted) {
      if (char === "\"" && next === "\"") {
        cell += "\"";
        index += 1;
      } else if (char === "\"") {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }
    if (char === "\"") {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  row.push(cell.replace(/\r$/, ""));
  rows.push(row);
  return rows;
}

function parseXlsxRows(buffer: Buffer) {
  if (buffer.length < 4 || buffer.readUInt32LE(0) !== 0x04034b50) {
    throw new Error("ไฟล์ .xlsx ไม่ถูกต้อง กรุณาบันทึกเป็น Excel Workbook (.xlsx) แล้วลองใหม่");
  }
  const entries = readZipEntries(buffer);
  const sharedStrings = parseSharedStrings(readZipText(buffer, entries, "xl/sharedStrings.xml"));
  const sheetEntry = entries.find((entry) => entry.name === "xl/worksheets/sheet1.xml")
    ?? entries.find((entry) => entry.name.startsWith("xl/worksheets/sheet"));
  if (!sheetEntry) throw new Error("ไม่พบ worksheet ในไฟล์ Excel");
  return parseSheetRows(readZipText(buffer, entries, sheetEntry.name), sharedStrings);
}

function readZipEntries(buffer: Buffer) {
  const eocdOffset = findEndOfCentralDirectory(buffer);
  const totalEntries = buffer.readUInt16LE(eocdOffset + 10);
  let offset = buffer.readUInt32LE(eocdOffset + 16);
  const entries: ZipEntry[] = [];

  for (let index = 0; index < totalEntries; index += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error("โครงสร้างไฟล์ Excel ไม่ถูกต้อง");
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.subarray(offset + 46, offset + 46 + fileNameLength).toString("utf8");
    entries.push({ name, method, compressedSize, localOffset });
    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  return entries;
}

function findEndOfCentralDirectory(buffer: Buffer) {
  const start = Math.max(0, buffer.length - 66000);
  for (let offset = buffer.length - 22; offset >= start; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  throw new Error("ไฟล์ Excel ไม่สมบูรณ์");
}

function readZipText(buffer: Buffer, entries: ZipEntry[], name: string) {
  const entry = entries.find((item) => item.name === name);
  if (!entry) return "";
  const localOffset = entry.localOffset;
  if (buffer.readUInt32LE(localOffset) !== 0x04034b50) throw new Error("โครงสร้างไฟล์ Excel ไม่ถูกต้อง");
  const fileNameLength = buffer.readUInt16LE(localOffset + 26);
  const extraLength = buffer.readUInt16LE(localOffset + 28);
  const dataStart = localOffset + 30 + fileNameLength + extraLength;
  const data = buffer.subarray(dataStart, dataStart + entry.compressedSize);
  if (entry.method === 0) return data.toString("utf8");
  if (entry.method === 8) return inflateRawSync(data).toString("utf8");
  throw new Error("ไฟล์ Excel ใช้รูปแบบการบีบอัดที่ระบบไม่รองรับ");
}

function parseSharedStrings(xml: string) {
  if (!xml) return [];
  return [...xml.matchAll(/<si\b[\s\S]*?<\/si>/g)].map(([item]) =>
    [...item.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)]
      .map((match) => decodeXml(match[1]))
      .join(""),
  );
}

function parseSheetRows(xml: string, sharedStrings: string[]) {
  const rows: string[][] = [];
  for (const rowMatch of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row: string[] = [];
    for (const cellMatch of rowMatch[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attributes = cellMatch[1];
      const body = cellMatch[2];
      const ref = attributes.match(/\br="([A-Z]+)\d+"/)?.[1];
      const index = ref ? columnIndex(ref) : row.length;
      row[index] = parseCellValue(attributes, body, sharedStrings);
    }
    rows.push(row);
  }
  return rows;
}

function parseCellValue(attributes: string, body: string, sharedStrings: string[]) {
  const type = attributes.match(/\bt="([^"]+)"/)?.[1] ?? "";
  const value = body.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? "";
  if (type === "s") return sharedStrings[Number(value)] ?? "";
  if (type === "inlineStr") {
    return [...body.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((match) => decodeXml(match[1])).join("");
  }
  return decodeXml(value);
}

function columnIndex(letters: string) {
  let index = 0;
  for (const letter of letters) {
    index = index * 26 + letter.charCodeAt(0) - 64;
  }
  return index - 1;
}

function decodeXml(value: string) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}
