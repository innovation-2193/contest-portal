import { CheckCircle2 } from "lucide-react";
import { adminNoticeText } from "../lib/admin-flash";

export function AdminNotice({ code }: { code?: string | null }) {
  const message = adminNoticeText(code);
  if (!message) return null;

  return <div className="admin-action-notice" role="status" aria-live="polite">
    <CheckCircle2/>
    <div>
      <b>ทำรายการเรียบร้อย</b>
      <span>{message}</span>
    </div>
  </div>;
}
