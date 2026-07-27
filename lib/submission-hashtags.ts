type HashtagSource = {
  titleTh?: string | null;
  titleEn?: string | null;
  summary?: string | null;
};

const meaningTags: Array<{ tag: string; pattern: RegExp; weight: number }> = [
  { tag: "สืบสวนดิจิทัล", pattern: /สืบสวน|สอบสวน|คดี|ผู้ต้องหา|พยาน|หลักฐาน|forensic|investigation/i, weight: 120 },
  { tag: "ไซเบอร์ปลอดภัย", pattern: /ไซเบอร์|ออนไลน์|หลอกลวง|มิจฉาชีพ|บัญชีม้า|phishing|fraud|scam|cyber/i, weight: 118 },
  { tag: "บริการประชาชน", pattern: /ประชาชน|ร้องเรียน|แจ้งเหตุ|บริการ|ผู้เสียหาย|service|community|citizen/i, weight: 116 },
  { tag: "จราจรอัจฉริยะ", pattern: /จราจร|รถ|ถนน|อุบัติเหตุ|ทางหลวง|traffic|vehicle|accident/i, weight: 114 },
  { tag: "เชื่อมโยงข้อมูล", pattern: /เชื่อมโยง|บูรณาการ|แลกเปลี่ยนข้อมูล|ระบบกลาง|integration|api|database/i, weight: 112 },
  { tag: "วิเคราะห์ข้อมูล", pattern: /วิเคราะห์|สถิติ|รายงาน|dashboard|ดัชนี|data|analytics|insight/i, weight: 110 },
  { tag: "AIช่วยตำรวจ", pattern: /ai|ปัญญาประดิษฐ์|แมชชีน|machine learning|โมเดล|คาดการณ์|ทำนาย/i, weight: 108 },
  { tag: "แจ้งเตือนทันที", pattern: /แจ้งเตือน|เตือนภัย|notification|alert|real.?time|ทันที|เฝ้าระวัง/i, weight: 106 },
  { tag: "ลดเวลางาน", pattern: /ลดเวลา|รวดเร็ว|อัตโนมัติ|automation|workflow|ประหยัดเวลา|เพิ่มประสิทธิภาพ/i, weight: 104 },
  { tag: "ตรวจเอกสาร", pattern: /เอกสาร|pdf|ocr|สแกน|แบบฟอร์ม|หนังสือ|document|scan/i, weight: 102 },
  { tag: "ภาพและกล้อง", pattern: /กล้อง|ภาพ|ใบหน้า|ป้ายทะเบียน|cctv|camera|vision|image/i, weight: 100 },
  { tag: "โดรนภาคสนาม", pattern: /โดรน|uav|ภาคสนาม|พื้นที่|ลาดตระเวน|drone/i, weight: 98 },
  { tag: "แผนที่พิกัด", pattern: /แผนที่|พิกัด|ตำแหน่ง|พื้นที่เสี่ยง|gis|map|location|tracking/i, weight: 96 },
  { tag: "IoTตำรวจ", pattern: /iot|sensor|เซนเซอร์|อุปกรณ์|device|smart/i, weight: 94 },
  { tag: "ป้องกันเหตุ", pattern: /ป้องกัน|เฝ้าระวัง|ความเสี่ยง|risk|safety|security|ปลอดภัย/i, weight: 92 },
  { tag: "งานพิสูจน์หลักฐาน", pattern: /พิสูจน์หลักฐาน|นิติวิทยาศาสตร์|dna|ลายนิ้วมือ|วัตถุพยาน/i, weight: 90 },
  { tag: "งานอำนวยการ", pattern: /บริหาร|จัดการ|ติดตามงาน|สารบรรณ|กำลังพล|ทรัพยากร/i, weight: 88 },
  { tag: "แอปภาคประชาชน", pattern: /แอป|มือถือ|mobile|application|app|แพลตฟอร์ม/i, weight: 86 },
  { tag: "พร้อมต่อยอด", pattern: /ต้นแบบ|ทดลอง|prototype|pilot|ต่อยอด|ใช้งานจริง|ขยายผล/i, weight: 84 },
];

const stopWords = new Set([
  "ระบบ",
  "โครงการ",
  "สำหรับ",
  "และ",
  "ของ",
  "การ",
  "เพื่อ",
  "ด้วย",
  "the",
  "and",
  "for",
  "with",
  "from",
  "police",
  "innovation",
]);

export function generateSubmissionHashtags(source: HashtagSource) {
  const text = [source.titleTh, source.titleEn, source.summary].filter(Boolean).join(" ");
  const scored = meaningTags
    .filter((item) => item.pattern.test(text))
    .sort((a, b) => b.weight - a.weight)
    .map((item) => item.tag);
  const tags = uniqueTags(scored).slice(0, 3);

  for (const token of extractTokens(text)) {
    pushTag(tags, token);
    if (tags.length >= 3) return tags;
  }

  for (const fallback of ["นวัตกรรมตำรวจ", "เพิ่มประสิทธิภาพ", "พร้อมต่อยอด"]) {
    pushTag(tags, fallback);
    if (tags.length >= 3) return tags;
  }

  return tags;
}

export function parseSubmissionHashtags(value?: string | null, fallback?: HashtagSource) {
  if (fallback) return generateSubmissionHashtags(fallback);
  const tags = String(value ?? "")
    .split(/[,\n]/)
    .map((tag) => normalizeTag(tag))
    .filter(Boolean);
  const unique = uniqueTags(tags).slice(0, 3);
  return unique;
}

export function serializeSubmissionHashtags(tags: string[]) {
  return uniqueTags(tags.map((tag) => normalizeTag(tag)).filter(Boolean)).slice(0, 3).join(",");
}

function extractTokens(text: string) {
  const normalized = text
    .replace(/[#_/|()[\]{}"'“”‘’.,:;!?<>]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const english = normalized.match(/[A-Za-z][A-Za-z0-9-]{2,20}/g) ?? [];
  const thai = normalized.match(/[\u0E00-\u0E7F]{3,16}/g) ?? [];
  return [...english, ...thai]
    .map((token) => normalizeTag(token))
    .filter((token) => token && !stopWords.has(token.toLowerCase()) && !stopWords.has(token));
}

function normalizeTag(value: string) {
  const compact = value
    .replace(/^#+/, "")
    .replace(/[^\u0E00-\u0E7FA-Za-z0-9-]/g, "")
    .trim();
  if (!compact) return "";
  if (/^[A-Za-z0-9-]+$/.test(compact)) {
    return compact.length > 18 ? compact.slice(0, 18) : compact;
  }
  return compact.length > 18 ? compact.slice(0, 18) : compact;
}

function pushTag(tags: string[], tag: string) {
  const normalized = normalizeTag(tag);
  if (!normalized) return;
  if (tags.some((item) => item.toLowerCase() === normalized.toLowerCase())) return;
  tags.push(normalized);
}

function uniqueTags(tags: string[]) {
  const result: string[] = [];
  tags.forEach((tag) => pushTag(result, tag));
  return result;
}
