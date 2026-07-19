"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import { MailCheck, ScrollText, X } from "lucide-react";
import { privacyConsent } from "./consentContent";
import { isThaiCitizenId } from "../lib/validation";

const mobilePattern = "0[689][0-9]{8}";

function RequiredMark() {
  return <span className="required-mark" aria-label="จำเป็นต้องกรอก"> *</span>;
}

function digitsOnly(event: React.FormEvent<HTMLInputElement>) {
  event.currentTarget.value = event.currentTarget.value.replace(/\D/g, "");
}

function isThaiMobilePhone(value: string) {
  return /^0[689]\d{8}$/.test(value);
}

export function RegistrationForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [viewedConsent, setViewedConsent] = useState(false);
  const [openConsent, setOpenConsent] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const citizenId = String(form.get("citizenId") ?? "");
    const phone = String(form.get("phone") ?? "");

    if (!isThaiCitizenId(citizenId)) {
      setError("หมายเลขบัตรประชาชนไม่ถูกต้อง กรุณาตรวจสอบเลข 13 หลัก");
      return;
    }

    if (!isThaiMobilePhone(phone)) {
      setError("เบอร์ติดต่อไม่ถูกต้อง กรุณากรอกเบอร์มือถือ 10 หลักที่ขึ้นต้นด้วย 06, 08 หรือ 09");
      return;
    }

    if (!viewedConsent || form.get("consentPdpa") !== "true") {
      setError("กรุณาเปิดอ่านและยอมรับนโยบายความเป็นส่วนตัวก่อนยืนยันการลงทะเบียน");
      return;
    }

    setBusy(true);
    setError("");

    const payload = Object.fromEntries(form);
    const response = await fetch("/api/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...payload,
        provider: params.get("provider") || "local",
        consentPdpa: true,
      }),
    });
    const data = await response.json();

    if (response.ok) {
      router.replace(`/register/success?code=${data.registrationCode}`);
      router.refresh();
    } else {
      setError(data.error);
      setBusy(false);
    }
  }

  function acceptConsent() {
    setViewedConsent(true);
    setOpenConsent(false);
  }

  useEffect(() => {
    if (!openConsent) return;
    document.body.classList.add("consent-modal-open");
    return () => document.body.classList.remove("consent-modal-open");
  }, [openConsent]);

  return (
    <form className="form-card registration-form" onSubmit={submit}>
      <div className="form-heading">
        <span>ข้อมูลผู้เข้าร่วม</span>
        <h2>กรอกข้อมูลลงทะเบียน</h2>
        <p>หลังบันทึก ระบบจะสร้าง QR Code ส่งไปยังอีเมลของผู้สมัคร และมี PDF สำหรับดาวน์โหลดเพื่อแสดงหน้างาน</p>
      </div>

      <div className="form-grid">
        <label className="span-2">อีเมล<RequiredMark /><input type="email" name="email" required placeholder="name@example.com" /></label>
        <label>คำนำหน้า<RequiredMark /><input name="title" required maxLength={32} placeholder="เช่น นาย, นางสาว, พ.ต.อ." /></label>
        <label>ชื่อ<RequiredMark /><input name="firstName" required placeholder="ชื่อจริง" /></label>
        <label>นามสกุล<RequiredMark /><input name="lastName" required placeholder="นามสกุล" /></label>
        <label>หมายเลขบัตรประชาชน<RequiredMark /><input name="citizenId" inputMode="numeric" pattern="[0-9]{13}" maxLength={13} required placeholder="13 หลัก" onInput={digitsOnly} title="กรอกเลขบัตรประชาชน 13 หลักที่ถูกต้อง" /></label>
        <label>เบอร์ติดต่อ<RequiredMark /><input name="phone" inputMode="tel" pattern={mobilePattern} maxLength={10} required placeholder="0812345678" onInput={digitsOnly} title="กรอกเบอร์มือถือ 10 หลักที่ขึ้นต้นด้วย 06, 08 หรือ 09" /></label>
        <label>ตำแหน่ง<RequiredMark /><input name="position" required placeholder="ตำแหน่งงาน" /></label>
        <label>สังกัด<RequiredMark /><input name="division" required placeholder="เช่น กลุ่มงาน / ฝ่าย / หน่วยงานต้นสังกัด" /></label>
        <label>หน่วยงาน<RequiredMark /><input name="bureau" required placeholder="ชื่อหน่วยงาน" /></label>
      </div>

      <div className="delivery-callout">
        <MailCheck />
        <div>
          <b>ยืนยันผ่านอีเมล</b>
          <p>โปรดใช้อีเมลที่เปิดได้จริงเพื่อรับ QR Code และไฟล์ PDF สำหรับเช็คอิน</p>
        </div>
      </div>

      <div className={viewedConsent ? "consent-card ready" : "consent-card"}>
        <div>
          <b>{viewedConsent ? "อ่านนโยบายแล้ว" : "กรุณาเปิดอ่านนโยบายก่อน"}</b>
          <p>ยินยอมให้โครงการประมวลผลข้อมูลส่วนบุคคลตามนโยบายความเป็นส่วนตัว</p>
        </div>
        <button className="secondary" type="button" onClick={() => setOpenConsent(true)}>
          <ScrollText />เปิดอ่าน
        </button>
        <label className="consent">
          <input type="checkbox" name="consentPdpa" value="true" required disabled={!viewedConsent} />
          {viewedConsent ? "ยินยอมตามรายละเอียดข้างต้น" : "ยังไม่สามารถติ๊กได้จนกว่าจะเปิดอ่าน"}
        </label>
      </div>

      {error && <p className="error">{error}</p>}
      <button className="primary submit" disabled={busy}>{busy ? "กำลังบันทึก..." : "ยืนยันการลงทะเบียน"}</button>

      {openConsent && typeof document !== "undefined" && createPortal(
        <div className="consent-modal" role="dialog" aria-modal="true" aria-labelledby="registration-consent-title">
          <div className="consent-modal-panel">
            <button className="modal-close" type="button" aria-label="ปิด" onClick={() => setOpenConsent(false)}><X /></button>
            <ScrollText />
            <h3 id="registration-consent-title">{privacyConsent.title}</h3>
            <div className="consent-modal-scroll">
              {privacyConsent.body.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            </div>
            <button className="primary" type="button" onClick={acceptConsent}>รับทราบและเปิดให้ยินยอม</button>
          </div>
        </div>,
        document.body,
      )}
    </form>
  );
}
