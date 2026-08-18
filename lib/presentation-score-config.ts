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
  guidance: string;
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
  { id: "innovation-concept", label: "แนวคิดหรือนวัตกรรม", max: 20, guidance: "มีแนวคิดสร้างสรรค์และมีความเป็นนวัตกรรมอย่างชัดเจน แตกต่างหรือพัฒนาจากแนวทางเดิมอย่างมีนัยสำคัญ สามารถแก้ไขปัญหาหรือเพิ่มประสิทธิภาพการปฏิบัติงานตำรวจ และแสดงให้เห็นถึงคุณค่า จุดเด่น หรือประโยชน์ที่เกิดขึ้นจากแนวคิดดังกล่าวอย่างเป็นรูปธรรม" },
  { id: "real-use", label: "ความเป็นไปได้ในการใช้งานจริง", max: 20, guidance: "ผลงานมีความพร้อมสูงในการใช้งานจริง ขั้นตอนชัดเจน เหมาะสมกับบริบทงานตำรวจ ผู้ใช้งานสามารถเข้าใจได้ และมีแนวทางรองรับข้อจำกัดหรือปัญหาที่อาจเกิดขึ้น" },
  { id: "measurable-result", label: "ผลลัพธ์หรือตัวชี้วัดที่พิสูจน์ได้", max: 20, guidance: "มีผลลัพธ์ชัดเจน วัดผลได้ มีหลักฐานรองรับ มีข้อมูลเปรียบเทียบหรือข้อมูลเชิงประจักษ์ และสามารถพิสูจน์ประโยชน์ของผลงานได้อย่างสมเหตุสมผล เช่น ลดเวลาการทำงาน" },
  { id: "scalability", label: "ศักยภาพในการขยายผล", max: 20, guidance: "มีศักยภาพสูงในการขยายผล สามารถนำไปปรับใช้กับหน่วยงานอื่นหรือพื้นที่อื่นได้ ใช้ทรัพยากรเหมาะสม และมีแนวทางนำไปใช้ต่ออย่างชัดเจน" },
  { id: "clarity", label: "ความชัดเจนของการนำเสนอ", max: 10, guidance: "นำเสนอเป็นระบบ ชัดเจน เข้าใจง่าย ครอบคลุมปัญหา วิธีดำเนินงาน ผลลัพธ์ และประโยชน์ของผลงาน ภายในเวลาที่กำหนด" },
  { id: "qa", label: "การตอบคำถามคณะกรรมการ", max: 10, guidance: "ตอบคำถามได้ตรงประเด็น ชัดเจน มีข้อมูลหรือหลักฐานสนับสนุน แสดงความเข้าใจในผลงานอย่างแท้จริง และสามารถชี้แจงข้อจำกัด ความเสี่ยง หรือแนวทางปรับปรุงได้ดี" },
];

export function formatPresentationJudge(profile: PresentationJudgeProfile) {
  return [profile.prefix, profile.firstName, profile.lastName].filter(Boolean).join(" ").replace(/\s+/g, " ").trim() || `กรรมการ ${profile.judgeKey}`;
}

export function presentationJudgeLabel(profile: PresentationJudgeProfile) {
  return `${formatPresentationJudge(profile)} • ${profile.position} • ${profile.role}`;
}
