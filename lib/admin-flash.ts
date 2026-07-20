export const adminNoticeMessages = {
  settings_saved: "บันทึกการตั้งค่าระบบเรียบร้อยแล้ว",
  news_added: "เพิ่มข่าวประชาสัมพันธ์เรียบร้อยแล้ว",
  news_deleted: "ลบข่าวประชาสัมพันธ์เรียบร้อยแล้ว",
  winner_added: "เพิ่มประกาศผลการแข่งขันเรียบร้อยแล้ว",
  winner_deleted: "ลบประกาศผลการแข่งขันเรียบร้อยแล้ว",
  assignment_saved: "บันทึกผู้ตรวจใบสมัครเรียบร้อยแล้ว",
  admin_added: "เพิ่มแอดมินและส่งลิงก์ตั้งรหัสผ่านเรียบร้อยแล้ว",
  admin_saved: "บันทึกข้อมูลแอดมินเรียบร้อยแล้ว",
  password_link_sent: "ส่งลิงก์ตั้งหรือรีเซ็ตรหัสผ่านเรียบร้อยแล้ว",
  admin_deleted: "ลบแอดมินเรียบร้อยแล้ว",
  participant_saved: "บันทึกข้อมูลผู้เข้าร่วมงานเรียบร้อยแล้ว",
  participant_deleted: "ลบข้อมูลผู้เข้าร่วมงานเรียบร้อยแล้ว",
  participants_deleted: "ลบข้อมูลผู้เข้าร่วมงานที่เลือกเรียบร้อยแล้ว",
  participant_none_selected: "ยังไม่ได้เลือกรายการผู้เข้าร่วมงานสำหรับลบ",
  submission_saved: "บันทึกข้อมูลใบสมัครประกวดเรียบร้อยแล้ว",
  score_saved: "บันทึกคะแนนเรียบร้อยแล้ว",
  submission_deleted: "ลบใบสมัครประกวดเรียบร้อยแล้ว",
  lucky_draw_done: "สุ่ม Lucky Draw และส่งอีเมลแจ้งผู้โชคดีเรียบร้อยแล้ว",
} as const;

export type AdminNoticeCode = keyof typeof adminNoticeMessages;

export function adminNoticeText(code?: string | null) {
  if (!code) return "";
  return adminNoticeMessages[code as AdminNoticeCode] ?? "";
}

export function adminNoticePath(path: string, code: AdminNoticeCode) {
  const [base, query = ""] = path.split("?");
  const params = new URLSearchParams(query);
  params.set("notice", code);
  const nextQuery = params.toString();
  return nextQuery ? `${base}?${nextQuery}` : base;
}
