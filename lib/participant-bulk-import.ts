import { participantRoles, type ParticipantRole } from "./local-registrations";
import { parseTabularFileRows } from "./tabular-file-reader";

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

const maxRows = 1000;

export async function parseParticipantBulkFile(file: File) {
  const rows = await parseTabularFileRows(file, { label: "รายชื่อ", maxBytes: 5 * 1024 * 1024 });
  return rowsToParticipants(rows);
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
