export const participantRoleFormalLabels = {
  VIP: "ผู้บริหารและแขกผู้มีเกียรติ",
  Guest: "ผู้เข้าร่วมงาน",
  Exhibitor: "ผู้จัดแสดงผลงาน",
  Competitor: "ผู้เข้าประกวด",
  Staff: "คณะทำงานและเจ้าหน้าที่",
} as const;

export function participantRoleFormalLabel(role?: string | null) {
  const normalized = String(role ?? "").trim() as keyof typeof participantRoleFormalLabels;
  return participantRoleFormalLabels[normalized] ?? "ผู้เข้าร่วมงาน";
}
