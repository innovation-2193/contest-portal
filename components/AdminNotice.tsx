import { CheckCircle2 } from "lucide-react";
import { adminNoticeText } from "../lib/admin-flash";

export function AdminNotice({ code }: { code?: string | null }) {
  const message = adminNoticeText(code);
  if (!message) return null;
  const isWarning = code === "participant_none_selected";

  return <div className={isWarning ? "admin-action-notice warning" : "admin-action-notice"} role="status" aria-live="polite">
    <CheckCircle2/>
    <div>
      <b>{isWarning ? "ยังไม่ได้ทำรายการ" : "ทำรายการเรียบร้อย"}</b>
      <span>{message}</span>
    </div>
  </div>;
}
