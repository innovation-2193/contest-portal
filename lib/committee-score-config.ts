export type CommitteeJudge = {
  key: string;
  order: number;
  rank: string;
  name: string;
  unit: string;
  role: string;
  fileLabel: string;
};

export type CommitteeScoreCriterion = {
  id: string;
  groupId: "rules" | "problem" | "innovation" | "evidence" | "impact";
  groupLabel: string;
  label: string;
  max: number;
};

export const committeeJudges: CommitteeJudge[] = [
  { key: "1", order: 1, rank: "พล.ต.ท.", name: "ไพบูลย์ น้อยหุ่น", unit: "ผบช.สทส.", role: "ประธานกรรมการ", fileLabel: "01-Paiboon-Noihun" },
  { key: "2", order: 2, rank: "พล.ต.ต.", name: "ฐากูร นิ่มสมบุญ", unit: "รอง ผบช.สทส.", role: "รองประธานกรรมการ", fileLabel: "02-Thakoon-Nimsomboon" },
  { key: "3", order: 3, rank: "พล.ต.ต.", name: "กิตติศัพท์ ทองศรีวงศ์", unit: "ผบก.สส.", role: "กรรมการ", fileLabel: "03-Kittisap-Thongsriwong" },
  { key: "4", order: 4, rank: "พล.ต.ต.", name: "ไพโรจน์ หมื่นกล้าหาญ", unit: "ผบก.ศทก.", role: "กรรมการ", fileLabel: "04-Pairoj-Muenklaharn" },
  { key: "5", order: 5, rank: "พล.ต.ต.", name: "กัมพล ลีลาประภาภรณ์", unit: "ผบก.สสท.", role: "กรรมการและเลขานุการ", fileLabel: "05-Kampol-Leelaprapaporn" },
];

export const committeeScoreCriteria: CommitteeScoreCriterion[] = [
  { id: "1.1", groupId: "rules", groupLabel: "1. ความเป็นผลงานของตำรวจ", label: "ที่มาและแรงบันดาลใจของผลงาน", max: 6 },
  { id: "1.2", groupId: "rules", groupLabel: "1. ความเป็นผลงานของตำรวจ", label: "สายงานที่รองรับ / หน่วยงานรับผิดชอบ", max: 2 },
  { id: "1.3", groupId: "rules", groupLabel: "1. ความเป็นผลงานของตำรวจ", label: "สอดคล้องกับหน้าที่และความรับผิดชอบของหน่วยงานในสังกัด สตช.", max: 6 },
  { id: "1.4", groupId: "rules", groupLabel: "1. ความเป็นผลงานของตำรวจ", label: "หลักฐานความเป็นเจ้าของผลงาน เช่น ผู้เกี่ยวข้อง ใบรับรอง สิทธิบัตร", max: 6 },
  { id: "2.1", groupId: "problem", groupLabel: "2. ปัญหาและความจำเป็น", label: "ปัญหาและอุปสรรคที่พบ", max: 5 },
  { id: "2.2", groupId: "problem", groupLabel: "2. ปัญหาและความจำเป็น", label: "กลุ่มเป้าหมายหรือผู้ได้รับผลกระทบ และผลกระทบที่เกิดขึ้น", max: 5 },
  { id: "2.3", groupId: "problem", groupLabel: "2. ปัญหาและความจำเป็น", label: "ผลลัพธ์ที่คาดหวังและความจำเป็นต่อภารกิจตำรวจ", max: 5 },
  { id: "3.1", groupId: "innovation", groupLabel: "3. แนวคิดหรือรูปแบบนวัตกรรม", label: "แนวคิด หลักการ หรือทฤษฎีที่เกี่ยวข้อง", max: 5 },
  { id: "3.2", groupId: "innovation", groupLabel: "3. แนวคิดหรือรูปแบบนวัตกรรม", label: "หลักการทำงานของผลงานนวัตกรรม", max: 5 },
  { id: "3.3", groupId: "innovation", groupLabel: "3. แนวคิดหรือรูปแบบนวัตกรรม", label: "ขั้นตอนการดำเนินงาน", max: 5 },
  { id: "3.4", groupId: "innovation", groupLabel: "3. แนวคิดหรือรูปแบบนวัตกรรม", label: "ความแตกต่างจากแนวทางหรือวิธีปฏิบัติเดิม", max: 5 },
  { id: "3.5", groupId: "innovation", groupLabel: "3. แนวคิดหรือรูปแบบนวัตกรรม", label: "ความเป็นไปได้ในการนำไปใช้งานจริง", max: 5 },
  { id: "4.1", groupId: "evidence", groupLabel: "4. หลักฐานผลลัพธ์เบื้องต้น", label: "ภาพถ่ายหรือภาพประกอบอธิบายภาพรวมนวัตกรรม", max: 5 },
  { id: "4.2", groupId: "evidence", groupLabel: "4. หลักฐานผลลัพธ์เบื้องต้น", label: "คลิปวิดีโอ 3-5 นาทีตามลิงก์ที่แนบในระบบ", max: 5 },
  { id: "4.3", groupId: "evidence", groupLabel: "4. หลักฐานผลลัพธ์เบื้องต้น", label: "ผลการทดลองหรือข้อมูลทางสถิติที่เกี่ยวข้อง", max: 5 },
  { id: "4.4", groupId: "evidence", groupLabel: "4. หลักฐานผลลัพธ์เบื้องต้น", label: "สรุปผลการทดสอบจากการนำไปใช้งานจริง", max: 5 },
  { id: "5.1", groupId: "impact", groupLabel: "5. ความคุ้มค่าและการขยายผล", label: "ข้อจำกัดและความเสี่ยงที่อาจเกิดจากการใช้งาน", max: 5 },
  { id: "5.2", groupId: "impact", groupLabel: "5. ความคุ้มค่าและการขยายผล", label: "แนวทางขยายผลและนำไปใช้งานในอนาคต", max: 5 },
  { id: "5.3", groupId: "impact", groupLabel: "5. ความคุ้มค่าและการขยายผล", label: "ระยะเวลาพัฒนาสู่การนำไปใช้งานจริง", max: 5 },
  { id: "5.4", groupId: "impact", groupLabel: "5. ความคุ้มค่าและการขยายผล", label: "งบประมาณที่คาดว่าต้องใช้เพื่อการใช้งานจริง", max: 5 },
];

export function committeeJudgeLabel(judge: CommitteeJudge) {
  return `${judge.rank}${judge.name} • ${judge.unit} / ${judge.role}`;
}
