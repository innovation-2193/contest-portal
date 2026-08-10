export const adminNoticeMessages = {
  settings_saved: "บันทึกการตั้งค่าระบบเรียบร้อยแล้ว",
  news_added: "เพิ่มข่าวประชาสัมพันธ์เรียบร้อยแล้ว",
  news_updated: "แก้ไขข่าวประชาสัมพันธ์เรียบร้อยแล้ว",
  news_deleted: "ลบข่าวประชาสัมพันธ์เรียบร้อยแล้ว",
  home_popup_saved: "บันทึก Popup หน้า Home เรียบร้อยแล้ว",
  home_popup_deleted: "ลบ Popup หน้า Home เรียบร้อยแล้ว",
  winner_added: "เพิ่มประกาศผลการแข่งขันเรียบร้อยแล้ว",
  winner_deleted: "ลบประกาศผลการแข่งขันเรียบร้อยแล้ว",
  assignment_saved: "บันทึกผู้ตรวจเอกสารใบสมัครเรียบร้อยแล้ว",
  competitor_registered: "ลงทะเบียนผู้สมัครประกวดเข้าร่วมงานและส่ง QR ยืนยันเรียบร้อยแล้ว",
  admin_added: "เพิ่มแอดมินและส่งลิงก์ตั้งรหัสผ่านเรียบร้อยแล้ว",
  admin_saved: "บันทึกข้อมูลแอดมินเรียบร้อยแล้ว",
  password_link_sent: "ส่งลิงก์ตั้งหรือรีเซ็ตรหัสผ่านเรียบร้อยแล้ว",
  admin_deleted: "ลบแอดมินเรียบร้อยแล้ว",
  parking_saved: "บันทึกรายการสำรองที่จอดรถเรียบร้อยแล้ว",
  parking_deleted: "ลบรายการสำรองที่จอดรถเรียบร้อยแล้ว",
  participant_created: "ลงทะเบียนผู้เข้าร่วมงานโดยแอดมินเรียบร้อยแล้ว",
  participant_created_checked_in: "ลงทะเบียนผู้เข้าร่วมงานและเช็คอินอัตโนมัติเรียบร้อยแล้ว",
  participants_imported: "นำเข้ารายชื่อผู้เข้าร่วมงานจากไฟล์เรียบร้อยแล้ว",
  participants_imported_checked_in: "นำเข้ารายชื่อผู้เข้าร่วมงานและเช็คอินอัตโนมัติเรียบร้อยแล้ว",
  participant_saved: "บันทึกข้อมูลผู้เข้าร่วมงานเรียบร้อยแล้ว",
  participant_deleted: "ลบข้อมูลผู้เข้าร่วมงานเรียบร้อยแล้ว",
  participants_deleted: "ลบข้อมูลผู้เข้าร่วมงานที่เลือกเรียบร้อยแล้ว",
  participant_none_selected: "ยังไม่ได้เลือกรายการผู้เข้าร่วมงานสำหรับลบ",
  participant_delete_forbidden: "บัญชี UCI ไม่มีสิทธิ์ลบข้อมูลผู้เข้าร่วมงาน",
  submission_saved: "บันทึกข้อมูลใบสมัครประกวดเรียบร้อยแล้ว",
  score_saved: "บันทึกคะแนนเรียบร้อยแล้ว",
  submission_deleted: "ลบใบสมัครประกวดเรียบร้อยแล้ว",
  lucky_draw_done: "สุ่ม Lucky Draw และส่งอีเมลแจ้งผู้โชคดีเรียบร้อยแล้ว",
  evaluations_reset: "รีเซ็ตคำตอบแบบประเมินความพึงพอใจทั้งหมดเรียบร้อยแล้ว",
  evaluations_reset_empty: "ยังไม่มีคำตอบแบบประเมินสำหรับรีเซ็ต",
  evaluations_reset_blocked: "กรุณา Reset ผล Lucky Draw ด้วย OTP ก่อนรีเซ็ตคำตอบแบบประเมิน",
  evaluation_opened: "เปิดแบบสอบถามความพึงพอใจเรียบร้อยแล้ว",
  evaluation_closed: "ปิดแบบสอบถามความพึงพอใจเรียบร้อยแล้ว",
  uci_video_added: "เพิ่มคลิปสอนการใช้งาน UCI เรียบร้อยแล้ว",
  uci_video_saved: "บันทึกคลิปสอนการใช้งาน UCI เรียบร้อยแล้ว",
  uci_video_deleted: "ลบคลิปสอนการใช้งาน UCI เรียบร้อยแล้ว",
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

export function safeAdminReturnPath(value: FormDataEntryValue | null | undefined, fallback = "/admin") {
  const raw = String(value ?? "").trim();
  if (!raw.startsWith("/admin")) return fallback;
  try {
    const url = new URL(raw, "https://admin.local");
    if (!url.pathname.startsWith("/admin")) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}

export function adminNoticeReturnPath(path: string, code: AdminNoticeCode) {
  const hashIndex = path.indexOf("#");
  const basePath = hashIndex >= 0 ? path.slice(0, hashIndex) : path;
  const hash = hashIndex >= 0 ? path.slice(hashIndex) : "";
  return `${adminNoticePath(basePath, code)}${hash}`;
}
