import type { RegistrationRecord } from "./local-registrations";
import { participantRoleClass } from "./participant-role-style";

export type ParticipantTypeKey = "vip" | "competitor" | "policeAttendee" | "generalAttendee" | "educationExhibitor" | "companyExhibitor" | "staff";

export type CompetitorSource = {
  submission_code: string;
  title_th: string;
  review_total_score: number | null;
  email: string;
  first_name: string;
  last_name: string;
  position: string;
  division: string;
  bureau: string;
};

export type ParticipantTypePerson = {
  registrationCode: string;
  name: string;
  role: string;
  roleClassName: string;
  organization: string;
  status: string;
};

export type ParticipantTypeGroup = {
  key: ParticipantTypeKey;
  label: string;
  detail: string;
  people: ParticipantTypePerson[];
};

const policeKeywords = [
  "ตำรวจ",
  "ตร.",
  "บช.",
  "บช",
  "บก.",
  "บก",
  "ภ.",
  "ภจว.",
  "สภ.",
  "กก.",
  "สทส.",
  "ศทก.",
  "รพ.ตร.",
  "รร.นรต.",
  "สพฐ.ตร.",
  "ศพฐ.",
  "ตชด.",
  "สตม.",
  "กองบัญชาการ",
  "กองบังคับการ",
  "สำนักงานตำรวจแห่งชาติ",
  "โรงพยาบาลตำรวจ",
  "โรงเรียนนายร้อยตำรวจ",
];

const policeCompactKeywords = [
  "กมค",
  "กองบินตำรวจ",
  "จต",
  "ตชด",
  "บก",
  "บกอก",
  "บช",
  "บชก",
  "บชน",
  "บชปส",
  "บชศ",
  "บชส",
  "บชสอท",
  "บชตชด",
  "บชทท",
  "บตร",
  "ภจว",
  "รพตร",
  "รรนรต",
  "สงกตร",
  "สงกตช",
  "สตม",
  "สทส",
  "สพฐ",
  "สพฐตร",
  "สภ",
  "สยศ",
  "สยศตร",
  "สลกตร",
  "สส",
  "ศทก",
  "ศพฐ",
];

const civilianOrAcademicTitles = [
  "นาย",
  "นาง",
  "นางสาว",
  "นส",
  "ดร",
  "ดอกเตอร์",
  "อ",
  "อาจารย์",
  "ผศ",
  "ผศดร",
  "ผู้ช่วยศาสตราจารย์",
  "ผู้ช่วยศาสตราจารย์ดร",
  "รศ",
  "รศดร",
  "รองศาสตราจารย์",
  "รองศาสตราจารย์ดร",
  "ศ",
  "ศดร",
  "ศาสตราจารย์",
  "ศาสตราจารย์ดร",
];

const educationKeywords = [
  "ส่วนการศึกษา",
  "การศึกษา",
  "สถาบัน",
  "มหาวิทยาลัย",
  "วิทยาลัย",
  "โรงเรียน",
  "คณะ",
  "academy",
  "university",
  "college",
  "school",
  "faculty",
];

export function buildParticipantTypeBreakdown(participants: RegistrationRecord[], options?: { competitorSubmissions?: CompetitorSource[] }): ParticipantTypeGroup[] {
  const groups: ParticipantTypeGroup[] = [
    { key: "vip", label: "VIP", detail: "ผู้เข้าร่วมระดับ VIP และแขกสำคัญ", people: [] },
    { key: "competitor", label: "ผู้สมัครประกวด", detail: "แสดงเฉพาะรายชื่อที่ Super Admin ประกาศเป็น 10 ทีมสุดท้ายแล้ว", people: [] },
    { key: "policeAttendee", label: "ผู้เข้าร่วมงาน (ตำรวจ)", detail: "Guest จากหน่วยงานตำรวจ", people: [] },
    { key: "generalAttendee", label: "ผู้เข้าร่วมงาน (ทั่วไป)", detail: "Guest จากหน่วยงานทั่วไปหรือผู้เข้าร่วมภายนอก", people: [] },
    { key: "educationExhibitor", label: "ผู้จัดแสดงผลงาน (ส่วนการศึกษา)", detail: "Exhibitor จากสถาบันหรือหน่วยงานด้านการศึกษา", people: [] },
    { key: "companyExhibitor", label: "ผู้จัดแสดงผลงาน (บริษัท)", detail: "Exhibitor จากบริษัทหรือองค์กรเอกชน", people: [] },
    { key: "staff", label: "Staff", detail: "ทีมงานและเจ้าหน้าที่สนับสนุนการจัดงาน", people: [] },
  ];
  const byKey = new Map(groups.map((group) => [group.key, group]));
  const competitorCodes = new Set<string>();

  for (const submission of options?.competitorSubmissions ?? []) {
    if (competitorCodes.has(submission.submission_code)) continue;
    competitorCodes.add(submission.submission_code);
    byKey.get("competitor")?.people.push({
      registrationCode: submission.submission_code,
      name: `${submission.first_name} ${submission.last_name}`,
      role: "ผู้สมัครประกวด",
      roleClassName: participantRoleClass("Competitor"),
      organization: compactOrg(submission.division, submission.bureau),
      status: "finalist",
    });
  }

  for (const participant of participants) {
    const key = participantTypeKey(participant);
    if (key === "competitor") continue;
    byKey.get(key)?.people.push({
      registrationCode: participant.registration_code,
      name: `${participant.title}${participant.first_name} ${participant.last_name}`,
      role: participant.participant_role,
      roleClassName: participantRoleClass(participant.participant_role),
      organization: compactParticipantOrg(participant),
      status: participant.status,
    });
  }

  return groups.filter((group) => group.key !== "competitor" || group.people.length > 0);
}

function participantTypeKey(participant: RegistrationRecord): ParticipantTypeKey {
  if (participant.participant_role === "Exhibitor") {
    const orgText = `${participant.division} ${participant.bureau}`.toLowerCase();
    return educationKeywords.some((keyword) => orgText.includes(keyword.toLowerCase()))
      ? "educationExhibitor"
      : "companyExhibitor";
  }
  if (participant.participant_role === "Staff") return "staff";
  if (participant.participant_role === "VIP") return "vip";
  if (participant.participant_role === "Competitor") return "competitor";
  return isPoliceParticipant(participant) ? "policeAttendee" : "generalAttendee";
}

function compactParticipantOrg(participant: RegistrationRecord) {
  return compactOrg(participant.division, participant.bureau);
}

function compactOrg(division: string, bureau: string) {
  return [division, bureau].map((item) => item.trim()).filter(Boolean).join(" / ") || "-";
}

function isPoliceParticipant(participant: RegistrationRecord) {
  const title = normalizeCompact(participant.title);
  if (title && !civilianOrAcademicTitles.includes(title)) return true;

  const text = `${participant.position} ${participant.division} ${participant.bureau}`.toLowerCase();
  const compactText = normalizeCompact(text);
  return policeKeywords.some((keyword) => text.includes(keyword.toLowerCase()))
    || policeCompactKeywords.some((keyword) => compactText.includes(keyword));
}

function normalizeCompact(value: string) {
  return value
    .toLowerCase()
    .replace(/[.\s/()\-]+/g, "")
    .trim();
}
