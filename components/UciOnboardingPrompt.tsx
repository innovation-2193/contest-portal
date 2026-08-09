"use client";

import { ArrowDown, CheckCircle2, Play, ShieldCheck, X } from "lucide-react";
import { useEffect, useState } from "react";

export function UciOnboardingPrompt({ accountEmail, hasVideos }: { accountEmail: string; hasVideos: boolean }) {
  const [visible, setVisible] = useState(false);
  const storageKey = `uci-onboarding-dismissed:${accountEmail.trim().toLowerCase()}`;

  useEffect(() => {
    try {
      setVisible(localStorage.getItem(storageKey) !== "1");
    } catch {
      setVisible(true);
    }
  }, [storageKey]);

  if (!visible || !hasVideos) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(storageKey, "1");
    } catch {
      // Continue for browsers that block local storage.
    }
    setVisible(false);
  };

  const startGuide = () => {
    dismiss();
    window.setTimeout(() => document.getElementById("uci-howto-videos")?.scrollIntoView({ behavior: "smooth", block: "start" }), 40);
  };

  return <section className="uci-onboarding" aria-labelledby="uci-onboarding-title">
    <div className="uci-onboarding-glow" aria-hidden="true"/>
    <div className="uci-onboarding-icon"><ShieldCheck/></div>
    <div className="uci-onboarding-copy">
      <span className="eyebrow">FIRST TIME HERE?</span>
      <h2 id="uci-onboarding-title">ยินดีต้อนรับสู่ระบบ UCI</h2>
      <p>ก่อนเริ่มปฏิบัติงาน แนะนำให้ดูวิดีโอสาธิตสั้น ๆ เพื่อเรียนรู้ขั้นตอนเช็คอิน Lucky Draw และเครื่องมือที่ใช้ในวันงาน</p>
      <div className="uci-onboarding-steps">
        <span><CheckCircle2/> ดูวิธีใช้งาน</span>
        <span><CheckCircle2/> ทดลองทำความเข้าใจขั้นตอน</span>
        <span><CheckCircle2/> เริ่มปฏิบัติงาน</span>
      </div>
    </div>
    <div className="uci-onboarding-actions">
      <button className="primary" type="button" onClick={startGuide}><Play/>เริ่มเรียนรู้</button>
      <button className="ghost-action" type="button" onClick={dismiss}><X/>ข้ามการแนะนำ</button>
    </div>
    <button className="uci-onboarding-arrow" type="button" onClick={startGuide} aria-label="ไปยังส่วนสาธิตการใช้งาน"><ArrowDown/></button>
  </section>;
}
