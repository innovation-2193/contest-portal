export type PresentationJudgeProfile = {
  judgeKey: string;
  prefix: string;
  firstName: string;
  lastName: string;
  position: string;
  role: string;
};

export type PresentationScoreCriterion = {
  id: string;
  label: string;
  max: number;
};

export const presentationScoreWeights = {
  paperScreening: 0.4,
  presentation: 0.6,
} as const;

const defaultJudges: PresentationJudgeProfile[] = [
  { judgeKey: "r2-1", prefix: "พลตำรวจโท", firstName: "จิรภพ", lastName: "ภูริเดช", position: "ผู้ช่วยผู้บัญชาการตำรวจแห่งชาติ", role: "ประธานกรรมการ" },
  { judgeKey: "r2-2", prefix: "พลตำรวจเอก", firstName: "สุวัฒน์", lastName: "แจ้งยอดสุข", position: "ประธานกรรมการ สำนักงานพัฒนาเทคโนโลยีอวกาศและภูมิสารสนเทศ (GISTDA)", role: "กรรมการ" },
  { judgeKey: "r2-3", prefix: "พลตำรวจโท", firstName: "ไพบูลย์", lastName: "น้อยหุ่น", position: "ผู้บัญชาการสำนักงานเทคโนโลยีสารสนเทศและการสื่อสาร", role: "รองประธานกรรมการ" },
  { judgeKey: "r2-4", prefix: "รองศาสตราจารย์ ดร.", firstName: "ชาญชัย", lastName: "ทองโสภา", position: "หัวหน้าศูนย์ความเป็นเลิศทางด้านการประยุกต์ใช้คลื่นสนามแม่เหล็กไฟฟ้า คณะวิศวกรรมอิเล็กทรอนิกส์ มหาวิทยาลัยเทคโนโลยีสุรนารี", role: "กรรมการ" },
  { judgeKey: "r2-5", prefix: "ดร.", firstName: "กริชผกา", lastName: "บุญเฟื่อง", position: "ผู้อำนวยการสำนักงานนวัตกรรมแห่งชาติ (NIA)", role: "กรรมการ" },
];

export function defaultPresentationJudgeProfiles() {
  return defaultJudges.map((judge) => ({ ...judge }));
}

export const presentationScoreCriteria: PresentationScoreCriterion[] = [
  { id: "real-use", label: "ความเป็นไปได้ในการใช้งานจริง", max: 25 },
  { id: "measurable-result", label: "ผลลัพธ์หรือตัวชี้วัดที่พิสูจน์ได้", max: 25 },
  { id: "scalability", label: "ศักยภาพในการขยายผล", max: 15 },
  { id: "clarity", label: "ความชัดเจนของการนำเสนอ", max: 15 },
  { id: "qa", label: "การตอบคำถามคณะกรรมการ", max: 20 },
];

export function formatPresentationJudge(profile: PresentationJudgeProfile) {
  return [profile.prefix, profile.firstName, profile.lastName].filter(Boolean).join(" ").replace(/\s+/g, " ").trim() || `กรรมการ ${profile.judgeKey}`;
}

export function presentationJudgeLabel(profile: PresentationJudgeProfile) {
  return `${formatPresentationJudge(profile)} • ${profile.position} • ${profile.role}`;
}
