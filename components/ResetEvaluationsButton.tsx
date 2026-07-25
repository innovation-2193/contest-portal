"use client";

import { useFormStatus } from "react-dom";
import { RotateCcw } from "lucide-react";

export function ResetEvaluationsButton({ disabled = false }: { disabled?: boolean }) {
  const { pending } = useFormStatus();

  function confirmReset(event: React.MouseEvent<HTMLButtonElement>) {
    const confirmed = window.confirm(
      "ยืนยันรีเซ็ตแบบประเมินความพึงพอใจทั้งหมด?\n\nคำตอบ คะแนน และข้อเสนอแนะทั้งหมดจะถูกลบ ผู้เข้าร่วมจะสามารถทำแบบประเมินใหม่ได้ และไม่สามารถย้อนคืนข้อมูลได้",
    );
    if (!confirmed) event.preventDefault();
  }

  return <button
    className="danger-btn"
    type="submit"
    onClick={confirmReset}
    disabled={disabled || pending}
  >
    <RotateCcw/>{pending ? "กำลังรีเซ็ต..." : "รีเซ็ตแบบประเมิน"}
  </button>;
}
