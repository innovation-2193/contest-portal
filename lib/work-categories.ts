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

export function normalizeWorkCategory(value: unknown): WorkCategory | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  return workCategoryValues.has(normalized as WorkCategory) ? normalized as WorkCategory : null;
}

export function workCategoryLabel(value: unknown) {
  const normalized = normalizeWorkCategory(value) ?? defaultWorkCategory;
  return workCategories.find((item) => item.value === normalized)?.label ?? workCategories[0].label;
}
