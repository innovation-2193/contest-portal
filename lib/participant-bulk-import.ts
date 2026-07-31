import { participantRoles, type ParticipantRole } from "./local-registrations";
import { inflateRawSync } from "zlib";

export type ParticipantBulkRow = {
  title: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  participantRole: ParticipantRole;
  position: string;
  division: string;
  bureau: string;
};

type ZipEntry = {
  name: string;
  method: number;
  compressedSize: number;
  localOffset: number;
};

const maxRows = 1000;

export async function parseParticipantBulkFile(file: File) {
  if (!file || file.size < 1) throw new Error("กรุณาแนบไฟล์รายชื่อ");
  if (file.size > 5 * 1024 * 1024) throw new Error("ไฟล์รายชื่อขนาดใหญ่เกินไป กรุณาใช้ไฟล์ไม่เกิน 5 MB");

  const name = file.name.toLowerCase();
  const buffer = Buffer.from(await file.arrayBuffer());
  const rows = name.endsWith(".csv")
    ? parseCsvRows(buffer.toString("utf8"))
    : name.endsWith(".xlsx")
      ? parseXlsxRows(buffer)
      : unsupportedFile();

  return rowsToParticipants(rows);
}

function unsupportedFile(): never {
  throw new Error("รองรับเฉพาะไฟล์ .xlsx หรือ .csv เท่านั้น");
}

function rowsToParticipants(rows: string[][]) {
  const cleaned = rows
    .map((row) => row.map((cell) => normalizeCell(cell)))
    .filter((row) => row.some(Boolean));
  if (!cleaned.length) throw new Error("ไม่พบข้อมูลรายชื่อในไฟล์");

  const header = detectHeader(cleaned[0]);
  const dataRows = header ? cleaned.slice(1) : cleaned;
  const indexes = header ?? { title: 0, firstName: 1, lastName: 2, participantRole: 3, position: 4, division: 5, bureau: 6, email: 7, phone: 8 };
  const participants: ParticipantBulkRow[] = [];

  dataRows.forEach((row) => {
    const title = cellAt(row, indexes.title);
    const firstName = cellAt(row, indexes.firstName);
    const lastName = cellAt(row, indexes.lastName);
    const email = normalizeEmail(cellAt(row, indexes.email));
    const phone = normalizePhone(cellAt(row, indexes.phone));
    const participantRole = normalizeBulkRole(cellAt(row, indexes.participantRole));
    const position = cellAt(row, indexes.position);
    const division = cellAt(row, indexes.division);
    const bureau = cellAt(row, indexes.bureau);
    if (!title && !firstName && !lastName && !email && !phone && !position && !division && !bureau && !cellAt(row, indexes.participantRole)) return;
    participants.push({ title, firstName, lastName, email, phone, participantRole, position, division, bureau });
  });

  if (!participants.length) throw new Error("ไม่พบรายชื่อที่นำเข้าได้");
  if (participants.length > maxRows) throw new Error(`นำเข้าได้สูงสุด ${maxRows.toLocaleString("th-TH")} รายการต่อไฟล์`);
  validateBulkEmails(participants);
  return participants;
}

function detectHeader(row: string[]) {
  const normalized = row.map((cell) => normalizeHeader(cell));
  const title = findHeaderIndex(normalized, ["คำนำหน้า", "คํานําหน้า", "ยศ", "title", "prefix"]);
  const firstName = findHeaderIndex(normalized, ["ชื่อ", "firstname", "first name", "name"]);
  const lastName = findHeaderIndex(normalized, ["นามสกุล", "lastname", "last name", "surname"]);
  const email = findHeaderIndex(normalized, ["อีเมล", "email", "e-mail", "mail"]);
  const phone = findHeaderIndex(normalized, ["เบอร์โทร", "เบอร์ติดต่อ", "โทร", "phone", "mobile", "tel"]);
  const participantRole = findHeaderIndex(normalized, ["role ผู้เข้าร่วม", "role", "participant role", "ประเภทผู้เข้าร่วม", "ประเภทผู้เข้าร่วมงาน"]);
  const position = findHeaderIndex(normalized, ["ตำแหน่ง", "ตําแหน่ง", "position", "rank"]);
  const division = findHeaderIndex(normalized, ["สังกัด / กองบังคับการ", "สังกัด", "กองบังคับการ", "division"]);
  const bureau = findHeaderIndex(normalized, ["กองบัญชาการ / ชื่อหน่วยงาน / หน่วยจัดบูธ", "กองบัญชาการ", "ชื่อหน่วยงาน", "หน่วยจัดบูธ", "bureau", "organization", "booth unit"]);
  if (title === -1 && firstName === -1 && lastName === -1 && email === -1 && phone === -1 && participantRole === -1 && position === -1 && division === -1 && bureau === -1) return null;
  return { title, firstName, lastName, email, phone, participantRole, position, division, bureau };
}

function cellAt(row: string[], index: number) {
  return index >= 0 ? row[index] ?? "" : "";
}

function normalizeBulkRole(value: string) {
  const role = value.trim();
  if (!role) return "Guest";
  const aliases: Record<string, ParticipantRole> = {
    vip: "VIP",
    guest: "Guest",
    exhibitor: "Exhibitor",
    competitor: "Competitor",
    staff: "Staff",
    "ผู้เข้าร่วมงานทั่วไป": "Guest",
    "ผู้เข้าร่วมทั่วไป": "Guest",
    "ผู้จัดบูธ": "Exhibitor",
    "จัดบูธ": "Exhibitor",
    "ผู้ประกวด": "Competitor",
    "ผู้ส่งผลงาน": "Competitor",
    "เจ้าหน้าที่": "Staff",
    "ทีมงาน": "Staff",
  };
  const normalized = aliases[role.toLowerCase()] ?? aliases[role];
  if (normalized) return normalized;
  if (participantRoles.includes(role as ParticipantRole)) return role as ParticipantRole;
  throw new Error(`Role ผู้เข้าร่วมต้องเป็น ${participantRoles.join(", ")} หรือเว้นว่างไว้`);
}

function findHeaderIndex(headers: string[], candidates: string[]) {
  return headers.findIndex((header) => candidates.includes(header));
}

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeCell(value: string) {
  return value.replace(/^\uFEFF/, "").trim().replace(/\s+/g, " ");
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function normalizePhone(value: string) {
  return value.trim().replace(/[\s-]+/g, "");
}

function validateBulkEmails(participants: ParticipantBulkRow[]) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  participants.forEach((participant, index) => {
    if (!participant.email) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(participant.email)) {
      throw new Error(`อีเมลแถวที่ ${(index + 2).toLocaleString("th-TH")} ไม่ถูกต้อง`);
    }
    if (seen.has(participant.email)) duplicates.add(participant.email);
    seen.add(participant.email);
  });
  if (duplicates.size) {
    throw new Error(`อีเมลไม่สามารถซ้ำกันได้ กรุณาตรวจสอบอีเมลซ้ำในไฟล์: ${[...duplicates].join(", ")}`);
  }
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
