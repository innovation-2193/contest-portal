import type { RegistrationRecord } from "./local-registrations";

export type ParticipantTypeKey = "guest" | "vip" | "competitor" | "companyExhibitor" | "educationExhibitor";

export type ParticipantTypePerson = {
  registrationCode: string;
  name: string;
  role: string;
  organization: string;
  status: string;
};

export type ParticipantTypeGroup = {
  key: ParticipantTypeKey;
  label: string;
  detail: string;
  people: ParticipantTypePerson[];
};

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

export function buildParticipantTypeBreakdown(participants: RegistrationRecord[]): ParticipantTypeGroup[] {
  const groups: ParticipantTypeGroup[] = [
    { key: "guest", label: "Guest", detail: "ผู้เข้าร่วมทั่วไปจากหน่วยงานตำรวจ", people: [] },
    { key: "vip", label: "VIP", detail: "ผู้เข้าร่วมระดับ VIP และแขกสำคัญ", people: [] },
    { key: "competitor", label: "Competitor", detail: "ผู้สมัครหรือผู้ส่งผลงานเข้าประกวด", people: [] },
    { key: "companyExhibitor", label: "ผู้จัดแสดงผลงาน (บริษัท)", detail: "Exhibitor จากบริษัทหรือองค์กรเอกชน", people: [] },
    { key: "educationExhibitor", label: "ผู้จัดแสดงผลงาน (ส่วนการศึกษา)", detail: "Exhibitor จากสถาบันหรือหน่วยงานด้านการศึกษา", people: [] },
  ];
  const byKey = new Map(groups.map((group) => [group.key, group]));

  for (const participant of participants) {
    const key = participantTypeKey(participant);
    byKey.get(key)?.people.push({
      registrationCode: participant.registration_code,
      name: `${participant.title}${participant.first_name} ${participant.last_name}`,
      role: participant.participant_role,
      organization: compactParticipantOrg(participant),
      status: participant.status,
    });
  }

  return groups;
}

function participantTypeKey(participant: RegistrationRecord): ParticipantTypeKey {
  if (participant.participant_role === "Exhibitor") {
    const orgText = `${participant.division} ${participant.bureau}`.toLowerCase();
    return educationKeywords.some((keyword) => orgText.includes(keyword.toLowerCase()))
      ? "educationExhibitor"
      : "companyExhibitor";
  }
  if (participant.participant_role === "VIP") return "vip";
  if (participant.participant_role === "Competitor") return "competitor";
  return "guest";
}

function compactParticipantOrg(participant: RegistrationRecord) {
  return [participant.division, participant.bureau].map((item) => item.trim()).filter(Boolean).join(" / ") || "-";
}
