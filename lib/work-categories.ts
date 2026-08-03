export const workCategories = [
  {
    value: "administration",
    label: "งานอำนวยการ",
    description: "ดูแลงานธุรการ การวางแผน งบประมาณ กำลังพล และการสนับสนุนการบริหารทั่วไป",
  },
  {
    value: "prevention",
    label: "งานป้องกันปราบปราม",
    description: "ออกตรวจตรา รักษาความสงบเรียบร้อย และระงับเหตุเฉพาะหน้า",
  },
  {
    value: "investigation",
    label: "งานสืบสวน",
    description: "หาข่าว สืบหาข้อเท็จจริง และแกะรอยคนร้ายนอกเครื่องแบบ",
  },
  {
    value: "inquiry",
    label: "งานสอบสวน",
    description: "รวบรวมพยานหลักฐาน ทำสำนวนคดี และสอบปากคำตามกฎหมายอาญา",
  },
  {
    value: "traffic",
    label: "งานจราจร",
    description: "ควบคุมและอำนวยความสะดวกด้านการจราจร รวมถึงป้องกันอุบัติเหตุบนท้องถนน",
  },
] as const;

export type WorkCategory = typeof workCategories[number]["value"];

export const defaultWorkCategory: WorkCategory = "administration";

const workCategoryValues = new Set(workCategories.map((item) => item.value));

const categoryKeywords: Record<WorkCategory, string[]> = {
  administration: [
    "ธุรการ", "อำนวยการ", "บริหาร", "เอกสาร", "สารบรรณ", "งบประมาณ", "กำลังพล", "พัสดุ", "จัดซื้อ", "จัดจ้าง",
    "แผน", "นโยบาย", "ทะเบียน", "รายงาน", "dashboard", "office", "admin", "hr", "budget", "document",
  ],
  prevention: [
    "ป้องกัน", "ปราบปราม", "สายตรวจ", "ออกตรวจ", "ตรวจตรา", "ระงับเหตุ", "เหตุเฉพาะหน้า", "ความสงบ",
    "191", "ตู้แดง", "ชุมชน", "ป้อม", "patrol", "prevention", "suppression", "incident", "emergency", "public safety",
  ],
  investigation: [
    "สืบสวน", "หาข่าว", "ข่าวกรอง", "แกะรอย", "ติดตามคนร้าย", "ผู้ต้องหา", "นอกเครื่องแบบ", "พิสูจน์ทราบ",
    "สืบค้น", "วิเคราะห์ข้อมูล", "เบาะแส", "investigation", "intelligence", "suspect", "tracking", "trace", "detective",
  ],
  inquiry: [
    "สอบสวน", "พนักงานสอบสวน", "สำนวน", "คดี", "พยานหลักฐาน", "สอบปากคำ", "คำให้การ", "อาญา", "แจ้งความ",
    "case file", "inquiry", "interrogation", "evidence", "witness", "criminal case", "complaint",
  ],
  traffic: [
    "จราจร", "รถ", "ถนน", "ทางม้าลาย", "สัญญาณไฟ", "อุบัติเหตุ", "ฝ่าฝืน", "ใบสั่ง", "ความเร็ว", "จอดรถ",
    "traffic", "road", "vehicle", "accident", "parking", "speed", "license plate", "plate", "congestion",
  ],
};

export function normalizeWorkCategory(value: unknown): WorkCategory | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  return workCategoryValues.has(normalized as WorkCategory) ? normalized as WorkCategory : null;
}

export function workCategoryLabel(value: unknown) {
  const normalized = normalizeWorkCategory(value) ?? defaultWorkCategory;
  return workCategories.find((item) => item.value === normalized)?.label ?? workCategories[0].label;
}

export function inferSubmissionWorkCategory(source: {
  titleTh?: string | null;
  titleEn?: string | null;
  summary?: string | null;
  hashtags?: string[] | null;
}) {
  const text = [
    source.titleTh,
    source.titleEn,
    source.summary,
    ...(source.hashtags ?? []),
  ].filter(Boolean).join(" ").toLowerCase();
  const scores = new Map<WorkCategory, number>();

  for (const category of workCategories) {
    let score = 0;
    for (const keyword of categoryKeywords[category.value]) {
      if (text.includes(keyword.toLowerCase())) score += keyword.length > 6 ? 3 : 1;
    }
    scores.set(category.value, score);
  }

  const [bestCategory, bestScore] = [...scores.entries()].sort((left, right) => right[1] - left[1])[0] ?? [defaultWorkCategory, 0];
  return bestScore > 0 ? bestCategory : defaultWorkCategory;
}
