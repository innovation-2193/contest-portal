import type { RegistrationRecord } from "./local-registrations";
import { participantRoleClass } from "./participant-role-style";

export type ParticipantTypeKey = "vip" | "competitor" | "policeAttendee" | "generalAttendee" | "educationExhibitor" | "companyExhibitor";

type CompetitorSource = {
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
  "บก.",
  "ภ.",
  "สภ.",
  "กก.",
  "กองบัญชาการ",
  "กองบังคับการ",
  "สำนักงานตำรวจแห่งชาติ",
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
    { key: "competitor", label: "ผู้สมัครประกวด", detail: "ค่าเริ่มต้นแสดงผู้สมัครอันดับ 1-10 จาก Score Board", people: [] },
    { key: "policeAttendee", label: "ผู้เข้าร่วมงาน (ตำรวจ)", detail: "Guest จากหน่วยงานตำรวจ", people: [] },
    { key: "generalAttendee", label: "ผู้เข้าร่วมงาน (ทั่วไป)", detail: "Guest จากหน่วยงานทั่วไปหรือผู้เข้าร่วมภายนอก", people: [] },
    { key: "educationExhibitor", label: "ผู้จัดแสดงผลงาน (ส่วนการศึกษา)", detail: "Exhibitor จากสถาบันหรือหน่วยงานด้านการศึกษา", people: [] },
    { key: "companyExhibitor", label: "ผู้จัดแสดงผลงาน (บริษัท)", detail: "Exhibitor จากบริษัทหรือองค์กรเอกชน", people: [] },
  ];
  const byKey = new Map(groups.map((group) => [group.key, group]));
  const competitorKeys = new Set<string>();

  for (const submission of options?.competitorSubmissions ?? []) {
    const key = participantIdentityKey(submission.email, submission.first_name, submission.last_name);
    competitorKeys.add(key);
    byKey.get("competitor")?.people.push({
      registrationCode: submission.submission_code,
      name: `${submission.first_name} ${submission.last_name}`,
      role: "ผู้สมัครประกวด",
      roleClassName: participantRoleClass("Competitor"),
      organization: compactOrg(submission.division, submission.bureau),
      status: "scoreboard",
    });
  }

  for (const participant of participants) {
    const key = participantTypeKey(participant);
    const identityKey = participantIdentityKey(participant.email, participant.first_name, participant.last_name);
    if (key === "competitor" && competitorKeys.has(identityKey)) continue;
    byKey.get(key)?.people.push({
      registrationCode: participant.registration_code,
      name: `${participant.title}${participant.first_name} ${participant.last_name}`,
      role: participant.participant_role,
      roleClassName: participantRoleClass(participant.participant_role),
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
  return isPoliceParticipant(participant) ? "policeAttendee" : "generalAttendee";
}

function compactParticipantOrg(participant: RegistrationRecord) {
  return compactOrg(participant.division, participant.bureau);
}

function compactOrg(division: string, bureau: string) {
  return [division, bureau].map((item) => item.trim()).filter(Boolean).join(" / ") || "-";
}

function participantIdentityKey(email: string, firstName: string, lastName: string) {
  return `${email.trim().toLowerCase()}|${firstName.trim().toLowerCase()}|${lastName.trim().toLowerCase()}`;
}

function isPoliceParticipant(participant: RegistrationRecord) {
  const text = `${participant.position} ${participant.division} ${participant.bureau}`.toLowerCase();
  return policeKeywords.some((keyword) => text.includes(keyword.toLowerCase()));
}
