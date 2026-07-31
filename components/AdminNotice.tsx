"use client";

import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { adminNoticeText } from "../lib/admin-flash";

export function AdminNotice({ code, error }: { code?: string | null; error?: string | null }) {
  const message = error || adminNoticeText(code);

  if (!message) return null;
  const isWarning = Boolean(error)
    || code === "participant_none_selected"
    || code === "evaluations_reset_empty"
    || code === "evaluations_reset_blocked";

  return <div className={isWarning ? "admin-action-notice warning" : "admin-action-notice"} role="status" aria-live="polite">
    {isWarning ? <AlertTriangle/> : <CheckCircle2/>}
    <div>
      <b>{isWarning ? "ยังไม่ได้ทำรายการ" : "ทำรายการเรียบร้อย"}</b>
      <span>{message}</span>
    </div>
  </div>;
}
