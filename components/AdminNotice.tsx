"use client";

import { useEffect, useRef } from "react";
import { CheckCircle2 } from "lucide-react";
import { adminNoticeText } from "../lib/admin-flash";

export function AdminNotice({ code }: { code?: string | null }) {
  const noticeRef = useRef<HTMLDivElement | null>(null);
  const message = adminNoticeText(code);
  useEffect(() => {
    if (!message) return;
    const notice = noticeRef.current;
    if (!notice) return;
    const frame = window.requestAnimationFrame(() => {
      notice.scrollIntoView({ behavior: "smooth", block: "center" });
      notice.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [message]);

  if (!message) return null;
  const isWarning = code === "participant_none_selected";

  return <div ref={noticeRef} className={isWarning ? "admin-action-notice warning" : "admin-action-notice"} role="status" aria-live="polite" tabIndex={-1}>
    <CheckCircle2/>
    <div>
      <b>{isWarning ? "ยังไม่ได้ทำรายการ" : "ทำรายการเรียบร้อย"}</b>
      <span>{message}</span>
    </div>
  </div>;
}
