export const evaluationScale = [
  { value: 5, label: "มากที่สุด" },
  { value: 4, label: "มาก" },
  { value: 3, label: "ปานกลาง" },
  { value: 2, label: "น้อย" },
  { value: 1, label: "น้อยที่สุด" },
] as const;

export const evaluationProfileFields = [
  {
    name: "gender",
    label: "1.1 เพศ",
    options: ["ชาย", "หญิง", "อื่น ๆ"],
    otherOption: "อื่น ๆ",
  },
  {
    name: "ageRange",
    label: "1.2 อายุ",
    options: ["ต่ำกว่า 30 ปี", "30-39 ปี", "40-49 ปี", "50 ปีขึ้นไป"],
  },
  {
    name: "organizationType",
    label: "1.3 ประเภทหน่วยงาน",
    options: ["สำนักงานตำรวจแห่งชาติ", "สถาบันการศึกษา", "ภาครัฐ", "ภาคเอกชน", "อื่น ๆ"],
    otherOption: "อื่น ๆ",
  },
  {
    name: "attendeeStatus",
    label: "1.4 สถานภาพ",
    options: ["ผู้เข้าร่วมงาน", "ผู้ส่งผลงานเข้าประกวด", "คณะกรรมการ", "เจ้าหน้าที่ผู้ปฏิบัติงาน", "อื่น ๆ"],
    otherOption: "อื่น ๆ",
  },
] as const;

export const evaluationSections = [
  {
    key: "event",
    title: "2.1 การจัดงานประกวดและแสดงนวัตกรรม",
    items: [
      "การประชาสัมพันธ์และการแจ้งข้อมูล",
      "ความเหมาะสมของกำหนดการและระยะเวลา",
      "ความสะดวกในการลงทะเบียนและเข้าร่วมงาน",
      "คุณภาพและประโยชน์ของผลงานนวัตกรรมที่นำเสนอ",
      "ระบบการตัดสินและความโปร่งใสในการประกวด",
      "การจัดนิทรรศการและการแสดงผลงานนวัตกรรม",
      "ภาพรวมของการจัดงานประกวดและแสดงนวัตกรรม",
      "ความพึงพอใจโดยรวมต่อการจัดงาน",
    ],
  },
  {
    key: "service",
    title: "2.2 การบริการ สถานที่ และการอำนวยความสะดวก",
    items: [
      "ความเหมาะสมของสถานที่จัดงาน",
      "การบริการโสต ทัศนูปกรณ์ อินเตอร์เน็ต",
      "การบริการอาหาร เครื่องดื่ม",
      "การอำนวยความสะดวกของเจ้าหน้าที่",
      "ความพึงพอใจในการบริการโดยภาพรวม",
    ],
  },
  {
    key: "benefit",
    title: "2.3 ประโยชน์ที่ได้รับจากการร่วมงาน",
    items: [
      "ความรู้เกี่ยวกับการพัฒนานวัตกรรมและงานวิจัย",
      "แลกเปลี่ยนเรียนรู้และสร้างเครือข่ายความร่วมมือ",
      "แรงบันดาลใจในการสร้างสรรค์นวัตกรรมใหม่",
      "แนวคิดในการพัฒนางานหรือหน่วยงานของตนเอง",
      "เผยแพร่และประชาสัมพันธ์ผลงานของหน่วยงาน",
    ],
  },
] as const;

export const evaluationQuestionLabels = evaluationSections.flatMap((section) => section.items);
export const evaluationQuestionCount = evaluationQuestionLabels.length;

export type EvaluationProfileFieldName = typeof evaluationProfileFields[number]["name"];
