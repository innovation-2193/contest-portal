import type { RegistrationRecord } from "./local-registrations";

export type BoothUnitStat = {
  label: string;
  people: number;
  attended: number;
};

export function buildBoothUnitStats(participants: RegistrationRecord[]): BoothUnitStat[] {
  const stats = new Map<string, BoothUnitStat>();
  for (const participant of participants) {
    const label = compactBoothUnit(participant);
    const key = normalizeBoothUnitKey(label);
    const current = stats.get(key) ?? { label, people: 0, attended: 0 };
    current.people += 1;
    if (participant.status === "attended") current.attended += 1;
    stats.set(key, current);
  }
  return [...stats.values()].sort((a, b) => b.people - a.people || b.attended - a.attended || a.label.localeCompare(b.label, "th"));
}

export function participantBoothOrganization(participant: RegistrationRecord) {
  return compactBoothUnit(participant);
}

function compactBoothUnit(participant: RegistrationRecord) {
  const parts = [participant.division, participant.bureau]
    .map((item) => item.trim().replace(/\s+/g, " "))
    .filter(Boolean);
  const boothUnit = participant.bureau.trim().replace(/\s+/g, " ");
  if (participant.participant_role === "Exhibitor" && organizationRootScore(boothUnit) > 1) {
    return canonicalBoothUnitLabel(boothUnit);
  }
  const root = pickOrganizationRoot(parts);
  return canonicalBoothUnitLabel(root || parts.join(" / ")) || "ไม่ระบุหน่วยงาน";
}

function pickOrganizationRoot(parts: string[]) {
  const scored = parts
    .map((part, index) => ({ part, index, score: organizationRootScore(part) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || b.index - a.index || a.part.length - b.part.length);
  return scored[0]?.part ?? "";
}

function organizationRootScore(value: string) {
  const text = normalizeBoothUnitKey(value);
  if (!text) return 0;
  if (isGenericBoothLabel(text)) return 1;
  if (text.includes("จุฬาลงกรณ์มหาวิทยาลัย") || text === "จุฬา") return 120;
  if (text.includes("มหาวิทยาลัย")) return 110;
  if (text.includes("บริษัท") || text.includes("จำกัด") || text.includes("มหาชน") || text.includes("ห้างหุ้นส่วน")) return 105;
  if (text.includes("วิทยาลัย") || text.includes("สถาบัน") || text.includes("โรงเรียน")) return 95;
  if (text.includes("สำนักงาน") || text.includes("กรม") || text.includes("กระทรวง") || text.includes("องค์การ") || text.includes("สมาคม")) return 80;
  if (text.includes("คณะ") || text.includes("ภาควิชา") || text.includes("สำนักบริหาร") || text.includes("ศูนย์")) return 20;
  return 0;
}

function canonicalBoothUnitLabel(value: string) {
  const clean = value.trim().replace(/\s+/g, " ");
  if (!clean) return "";
  const normalized = normalizeBoothUnitKey(clean);
  if (normalized === "จุฬา" || normalized.includes("จุฬาลงกรณ์มหาวิทยาลัย")) return "จุฬาลงกรณ์มหาวิทยาลัย";

  const universityAbbreviation = clean.match(/^ม(?:\.|\s+)\s*(.+)$/);
  if (universityAbbreviation?.[1]) {
    return `มหาวิทยาลัย${universityAbbreviation[1].trim().replace(/\s+/g, "")}`;
  }

  return clean;
}

function isGenericBoothLabel(text: string) {
  return [
    "บริษัทเอกชน",
    "หน่วยงานเอกชน",
    "เอกชน",
    "ส่วนการศึกษา",
    "การศึกษา",
    "ผู้จัดแสดงผลงาน",
  ].includes(text);
}

function normalizeBoothUnitKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[๐-๙]/g, (digit) => String("๐๑๒๓๔๕๖๗๘๙".indexOf(digit)))
    .replace(/จุฬาฯ/g, "จุฬาลงกรณ์มหาวิทยาลัย")
    .replace(/^ม(?:\.|\s+)\s*/g, "มหาวิทยาลัย")
    .replace(/\s+/g, "")
    .replace(/[.()"']/g, "");
}
