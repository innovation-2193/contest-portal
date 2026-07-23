"use client";

import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { CheckCircle2, Download, FileText, Plus, ScrollText, Trash2, UploadCloud, X } from "lucide-react";
import { contestAgreement, privacyConsent } from "./consentContent";
import { isThaiCitizenId } from "../lib/validation";
import type { RegistrationRecord } from "../lib/local-registrations";

const mobilePattern = "0[689][0-9]{8}";
const summaryMinLength = 20;
const summaryMaxLength = 500;

const docs = [
  {
    name: "ownership",
    label: "3.1 หลักฐานความเป็นเจ้าของผลงาน",
    url: "https://docs.google.com/document/d/15d-L5Yq3XdXtpb1Ie6wos16XsRtJxDjp/edit?usp=sharing&ouid=104027922122534857899&rtpof=true&sd=true",
  },
  {
    name: "concept",
    label: "3.2 แบบสรุปผลงานโดยย่อ",
    url: "https://docs.google.com/document/d/193Y6_aeJQkRtsT2I0kJpqeOIu_UCHqbD/edit?usp=sharing&ouid=104027922122534857899&rtpof=true&sd=true",
  },
  {
    name: "prototype",
    label: "3.3 หลักฐานต้นแบบหรือการทดลอง",
    url: "https://docs.google.com/document/d/1KQKDsA5th88TfVLQanDxDtFGa55JREcC/edit?usp=sharing&ouid=104027922122534857899&rtpof=true&sd=true",
  },
  {
    name: "implementation",
    label: "3.4 แผนต่อยอดใช้งานจริง",
    url: "https://docs.google.com/document/d/1114_0XUvmg8D_3Y46-6qEAz88rlulUL7/edit?usp=sharing&ouid=104027922122534857899&rtpof=true&sd=true",
  },
] as const;

const modalContent = {
  rules: contestAgreement,
  pdpa: privacyConsent,
} as const;

type TeamMember = {
  title: string;
  firstName: string;
  lastName: string;
  citizenId: string;
  phone: string;
  email: string;
  position: string;
  division: string;
  bureau: string;
};

type ConsentKey = keyof typeof modalContent;

type SubmissionPrefill = Pick<RegistrationRecord, "email" | "title" | "first_name" | "last_name" | "citizen_id" | "phone" | "position" | "division" | "bureau" | "registration_code">;

function RequiredMark() {
  return <span className="required-mark" aria-label="จำเป็นต้องกรอก"> *</span>;
}

function digitsOnly(event: React.FormEvent<HTMLInputElement>) {
  event.currentTarget.value = event.currentTarget.value.replace(/\D/g, "");
}

function isThaiMobilePhone(value: string) {
  return /^0[689]\d{8}$/.test(value);
}

const emptyMember = (): TeamMember => ({
  title: "",
  firstName: "",
  lastName: "",
  citizenId: "",
  phone: "",
  email: "",
  position: "",
  division: "",
  bureau: "",
});

export function SubmissionForm({ prefill }: { prefill?: SubmissionPrefill | null }) {
  const router = useRouter();
  const [type, setType] = useState<"individual" | "team">("individual");
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [openConsent, setOpenConsent] = useState<ConsentKey | null>(null);
  const [summaryLength, setSummaryLength] = useState(0);
  const [summaryWarning, setSummaryWarning] = useState("");
  const [viewedConsent, setViewedConsent] = useState<Record<ConsentKey, boolean>>({
    rules: false,
    pdpa: false,
  });

  function updateMember(index: number, key: keyof TeamMember, value: string) {
    const nextValue = key === "citizenId" || key === "phone" ? value.replace(/\D/g, "") : value;
    setMembers((current) =>
      current.map((member, i) => (i === index ? { ...member, [key]: nextValue } : member)),
    );
  }

  function confirmConsent(key: ConsentKey) {
    setViewedConsent((current) => ({ ...current, [key]: true }));
    setOpenConsent(null);
  }

  useEffect(() => {
    if (!openConsent) return;
    document.body.classList.add("consent-modal-open");
    return () => document.body.classList.remove("consent-modal-open");
  }, [openConsent]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!e.currentTarget.reportValidity()) return;

    const form = new FormData(e.currentTarget);
    const citizenId = String(form.get("citizenId") ?? "");
    const phone = String(form.get("phone") ?? "");
    const rawSummary = String(form.get("summary") ?? "").trim();
    const summary = rawSummary.slice(0, summaryMaxLength);

    if (summary.length < summaryMinLength) {
      setError(`คำอธิบายย่อต้องมีอย่างน้อย ${summaryMinLength} ตัวอักษร`);
      return;
    }
    setSummaryWarning(rawSummary.length > summaryMaxLength ? `ข้อความเกิน ${summaryMaxLength} ตัวอักษร ระบบตัดและบันทึกเฉพาะ ${summaryMaxLength} ตัวอักษรแรกให้แล้ว` : "");

    form.set("summary", summary);

    if (!isThaiCitizenId(citizenId)) {
      setError("หมายเลขบัตรประชาชนผู้สมัครหลักไม่ถูกต้อง กรุณาตรวจสอบเลข 13 หลัก");
      return;
    }

    if (!isThaiMobilePhone(phone)) {
      setError("เบอร์ติดต่อผู้สมัครหลักไม่ถูกต้อง กรุณากรอกเบอร์มือถือ 10 หลักที่ขึ้นต้นด้วย 06, 08 หรือ 09");
      return;
    }

    for (const [index, member] of members.entries()) {
      if (!isThaiCitizenId(member.citizenId)) {
        setError(`หมายเลขบัตรประชาชนสมาชิกคนที่ ${index + 2} ไม่ถูกต้อง`);
        return;
      }

      if (!isThaiMobilePhone(member.phone)) {
        setError(`เบอร์ติดต่อสมาชิกคนที่ ${index + 2} ไม่ถูกต้อง กรุณากรอกเบอร์มือถือ 10 หลักที่ขึ้นต้นด้วย 06, 08 หรือ 09`);
        return;
      }
    }

    if (!viewedConsent.rules || form.get("consentRules") !== "true") {
      setError("กรุณาเปิดอ่านและยอมรับข้อตกลงการประกวดก่อนส่งใบสมัคร");
      return;
    }

    if (!viewedConsent.pdpa || form.get("consentPdpa") !== "true") {
      setError("กรุณาเปิดอ่านและยินยอมหนังสือข้อมูลส่วนบุคคลก่อนส่งใบสมัคร");
      return;
    }

    setBusy(true);
    setUploadProgress(2);
    setError("");
    form.set("submissionType", type);
    form.set("teamMembers", JSON.stringify(type === "team" ? members : []));

    try {
      const data = await uploadSubmission(form, setUploadProgress);
      setUploadProgress(100);
      router.push(`/submit/success?code=${data.submissionCode}`);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "ไม่สามารถส่งใบสมัครได้");
      setBusy(false);
      setUploadProgress(0);
    }
  }

  return (
    <form className="form-card submission" onSubmit={submit}>
      <div className="form-heading">
        <span>แบบฟอร์มส่งผลงาน</span>
        <h2>ข้อมูลใบสมัครประกวด</h2>
        <p>บัญชีที่ใช้ลงทะเบียนและส่งผลงานต้องเป็นอีเมลเดียวกัน</p>
      </div>

      <section className="form-section">
        <header>
          <span>Applicant</span>
          <h3>1. ข้อมูลผู้สมัคร</h3>
        </header>
        <p className="police-only-note">แบบฟอร์มนี้สำหรับข้าราชการตำรวจหรือหน่วยงานตำรวจเท่านั้น กรุณาระบุตำแหน่ง กองบังคับการ และกองบัญชาการให้ครบถ้วน</p>
        {prefill && <p className="police-only-note">ระบบดึงข้อมูลจากการลงทะเบียนเข้าร่วมงานเลขที่ {prefill.registration_code} มาเติมให้แล้ว สามารถแก้ไขข้อมูลอื่นได้ ยกเว้นอีเมล</p>}
        <div className="type-picker">
          <button type="button" className={type === "individual" ? "active" : ""} onClick={() => setType("individual")}>
            ส่งเดี่ยว<small>ส่งในนามบุคคล</small>
          </button>
          <button type="button" className={type === "team" ? "active" : ""} onClick={() => setType("team")}>
            ส่งแบบกลุ่ม<small>ระบุชื่อทีมและสมาชิก</small>
          </button>
        </div>
        {type === "team" && (
          <label>
            ชื่อทีม<RequiredMark /><input name="teamName" required />
          </label>
        )}
        <div className="form-grid">
          <label>คำนำหน้า<RequiredMark /><input name="title" maxLength={32} defaultValue={prefill?.title ?? ""} required /></label>
          <label>ชื่อ<RequiredMark /><input name="firstName" defaultValue={prefill?.first_name ?? ""} required /></label>
          <label>นามสกุล<RequiredMark /><input name="lastName" defaultValue={prefill?.last_name ?? ""} required /></label>
          <label>หมายเลขบัตรประชาชน<RequiredMark /><input name="citizenId" inputMode="numeric" pattern="[0-9]{13}" maxLength={13} defaultValue={prefill?.citizen_id ?? ""} required onInput={digitsOnly} title="กรอกเลขบัตรประชาชน 13 หลักที่ถูกต้อง" /></label>
          <label>เบอร์ติดต่อ<RequiredMark /><input name="phone" inputMode="tel" pattern={mobilePattern} maxLength={10} defaultValue={prefill?.phone ?? ""} title="กรอกเบอร์มือถือ 10 หลักที่ขึ้นต้นด้วย 06, 08 หรือ 09" required onInput={digitsOnly} /></label>
          <label>ตำแหน่ง<RequiredMark /><input name="position" defaultValue={prefill?.position ?? ""} required /></label>
          <label>กองบังคับการ<RequiredMark /><input name="division" defaultValue={prefill?.division ?? ""} required /></label>
          <label>กองบัญชาการ<RequiredMark /><input name="bureau" defaultValue={prefill?.bureau ?? ""} required /></label>
          <label className="span-2">อีเมล<RequiredMark />{prefill?.email ? <><input type="email" value={prefill.email} disabled readOnly /><input type="hidden" name="email" value={prefill.email} /></> : <input type="email" name="email" required />}</label>
        </div>
        {type === "team" && (
          <div className="team-members">
            {members.map((member, index) => (
              <fieldset key={index}>
                <legend>สมาชิกคนที่ {index + 2}</legend>
                <button type="button" className="remove-member" title="ลบสมาชิก" onClick={() => {
                  if (window.confirm(`ยืนยันลบสมาชิกคนที่ ${index + 2}?`)) setMembers((current) => current.filter((_, i) => i !== index));
                }}>
                  <Trash2 />
                </button>
                <div className="form-grid">
                  {(["title", "firstName", "lastName", "citizenId", "phone", "email", "position", "division", "bureau"] as const).map((key) => (
                    <label key={key}>
                      {({ title: "คำนำหน้า", firstName: "ชื่อ", lastName: "นามสกุล", citizenId: "หมายเลขบัตรประชาชน", phone: "เบอร์ติดต่อ", email: "อีเมล", position: "ตำแหน่ง", division: "กองบังคับการ", bureau: "กองบัญชาการ" } as const)[key]}<RequiredMark />
                      <input
                        type={key === "email" ? "email" : "text"}
                        inputMode={key === "citizenId" || key === "phone" ? "numeric" : undefined}
                        pattern={key === "citizenId" ? "[0-9]{13}" : key === "phone" ? mobilePattern : undefined}
                        maxLength={key === "citizenId" ? 13 : key === "phone" ? 10 : key === "title" ? 32 : undefined}
                        title={key === "citizenId" ? "กรอกเลขบัตรประชาชน 13 หลักที่ถูกต้อง" : key === "phone" ? "กรอกเบอร์มือถือ 10 หลักที่ขึ้นต้นด้วย 06, 08 หรือ 09" : undefined}
                        value={member[key]}
                        onChange={(event) => updateMember(index, key, event.target.value)}
                        required
                      />
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
            {members.length < 2 && (
              <button className="add-member" type="button" onClick={() => setMembers((current) => [...current, emptyMember()])}>
                <Plus /> เพิ่มสมาชิก ({members.length + 1}/2 คนเพิ่มเติม)
              </button>
            )}
          </div>
        )}
      </section>

      <section className="form-section">
        <header>
          <span>Innovation</span>
          <h3>2. ข้อมูลผลงานนวัตกรรม</h3>
        </header>
        <div className="form-grid">
          <label>ชื่อผลงานนวัตกรรม ภาษาไทย<RequiredMark /><input name="titleTh" required /></label>
          <label>ชื่อผลงานนวัตกรรม ภาษาอังกฤษ<input name="titleEn" /></label>
          <label className="span-2">คำอธิบายย่อ (ขั้นต่ำ 20 และไม่เกิน 500 ตัวอักษร)<RequiredMark />
            <textarea
              name="summary"
              minLength={summaryMinLength}
              required
              placeholder="สรุปปัญหา แนวคิดนวัตกรรม และประโยชน์ที่คาดว่าจะได้รับ อย่างน้อย 20 ตัวอักษร"
              title={`กรอกคำอธิบายย่ออย่างน้อย ${summaryMinLength} ตัวอักษร หากเกินระบบจะบันทึกเฉพาะ ${summaryMaxLength} ตัวอักษรแรก`}
              onInput={(event) => {
                const nextLength = event.currentTarget.value.trim().length;
                setSummaryLength(nextLength);
                setSummaryWarning(nextLength > summaryMaxLength ? `พิมพ์เกิน ${summaryMaxLength} ตัวอักษรแล้ว ระบบจะตัดส่วนเกินออกให้เมื่อส่งใบสมัคร` : "");
              }}
            />
            <small className={summaryLength > 0 && summaryLength < summaryMinLength ? "field-help invalid" : "field-help"}>
              กรอกอย่างน้อย {summaryMinLength} ตัวอักษร • ตอนนี้ {summaryLength.toLocaleString("th-TH")} ตัวอักษร • บันทึกสูงสุด {summaryMaxLength} ตัวอักษร
            </small>
            {summaryWarning && <small className="field-help invalid" role="status" aria-live="polite">{summaryWarning}</small>}
          </label>
          <label className="span-2">Link Video
            <input type="url" name="videoUrl" placeholder="Google Drive, YouTube หรือ OneDrive" />
            <small className="field-help">หมายเหตุ: การแนบ Link Video มีผลต่อการพิจารณาคะแนน</small>
          </label>
        </div>
      </section>

      <section className="form-section">
        <header>
          <span>Documents</span>
          <h3>3. ไฟล์แนบ</h3>
        </header>
        <div className="document-guide">
          <div className="document-guide-intro">
            <UploadCloud />
            <div>
              <b>ดาวน์โหลดแบบฟอร์มไปกรอกก่อน</b>
              <p>เปิดลิงก์แบบฟอร์ม 3.1 - 3.4 กรอกข้อมูลให้ครบ แล้วบันทึกเป็น PDF เพื่อนำมาอัปโหลดในช่องด้านล่าง</p>
            </div>
          </div>
          <div className="document-links">
            {docs.map((doc) => (
              <a key={doc.name} href={doc.url} target="_blank" rel="noreferrer">
                <FileText />
                <span>{doc.label}<small>เปิดแบบฟอร์ม Google Docs</small></span>
                <Download />
              </a>
            ))}
          </div>
        </div>
        <div className="file-upload-list">
          {docs.map(({ name, label }) => (
            <DocumentUploadField key={name} name={name} label={label} />
          ))}
        </div>
      </section>

      <section className="form-section agreements">
        <header>
          <span>Agreement</span>
          <h3>ยืนยันข้อตกลงก่อนส่งใบสมัคร</h3>
        </header>
        <ConsentCard
          name="consentRules"
          label="ยินยอมรับข้อตกลงการประกวดนวัตกรรมทุกประการ และรับรองว่าข้อมูลเป็นความจริง"
          viewed={viewedConsent.rules}
          onOpen={() => setOpenConsent("rules")}
        />
        <ConsentCard
          name="consentPdpa"
          label="ยินยอมให้โครงการประมวลผลข้อมูลส่วนบุคคลตามนโยบายความเป็นส่วนตัว"
          viewed={viewedConsent.pdpa}
          onOpen={() => setOpenConsent("pdpa")}
        />
      </section>

      {error && <p className="error">{error}</p>}
      {busy && <div className="upload-progress" role="status" aria-live="polite">
        <div><span style={{ width: `${uploadProgress}%` }} /></div>
        <p>{uploadProgress < 100 ? `กำลังอัปโหลดไฟล์และส่งใบสมัคร ${uploadProgress}%` : "อัปโหลดสำเร็จ กำลังพาไปหน้าสรุปผล"}</p>
      </div>}
      <button className="primary submit" disabled={busy}>{busy ? "กำลังส่งข้อมูล..." : "ส่งผลงานเข้าประกวด"}</button>

      {openConsent && typeof document !== "undefined" && createPortal(
        <div className="consent-modal" role="dialog" aria-modal="true" aria-labelledby="consent-modal-title">
          <div className="consent-modal-panel">
            <button className="modal-close" type="button" aria-label="ปิด" onClick={() => setOpenConsent(null)}><X /></button>
            <ScrollText />
            <h3 id="consent-modal-title">{modalContent[openConsent].title}</h3>
            <div className="consent-modal-scroll">
              {modalContent[openConsent].body.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            </div>
            <button className="primary" type="button" onClick={() => confirmConsent(openConsent)}>รับทราบและเปิดให้ยินยอม</button>
          </div>
        </div>,
        document.body,
      )}
    </form>
  );
}

function DocumentUploadField({ name, label }: { name: string; label: string }) {
  const id = useId();
  const [file, setFile] = useState<File | null>(null);

  return (
    <div className={file ? "file-field has-file" : "file-field"}>
      <div className="file-field-head">
        <b>{label}<RequiredMark /></b>
        <small>PDF ไม่เกิน 10 MB</small>
      </div>
      <input
        id={id}
        className="file-input"
        type="file"
        name={name}
        accept="application/pdf"
        required
        onChange={(event) => setFile(event.currentTarget.files?.[0] ?? null)}
      />
      <label className="file-dropzone" htmlFor={id}>
        <span className="file-dropzone-icon">{file ? <CheckCircle2 /> : <UploadCloud />}</span>
        <span className="file-dropzone-copy">
          <strong>{file ? file.name : "เลือกไฟล์ PDF"}</strong>
          <small>{file ? formatFileSize(file.size) : "คลิกเพื่อ Browse ไฟล์เอกสารประกอบ"}</small>
        </span>
        <span className="file-browse-button">Browse</span>
      </label>
    </div>
  );
}

function formatFileSize(size: number) {
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function uploadSubmission(form: FormData, onProgress: (progress: number) => void) {
  return new Promise<{ submissionCode: string }>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", "/api/submissions");

    request.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      const progress = Math.min(96, Math.max(4, Math.round((event.loaded / event.total) * 96)));
      onProgress(progress);
    };

    request.onload = () => {
      let data: { submissionCode?: string; error?: string } = {};
      try {
        data = JSON.parse(request.responseText);
      } catch {
        reject(new Error("ระบบตอบกลับไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง"));
        return;
      }

      if (request.status >= 200 && request.status < 300 && data.submissionCode) {
        resolve({ submissionCode: data.submissionCode });
      } else {
        reject(new Error(data.error || "ไม่สามารถส่งใบสมัครได้"));
      }
    };

    request.onerror = () => reject(new Error("เชื่อมต่อระบบอัปโหลดไม่ได้ กรุณาลองใหม่อีกครั้ง"));
    request.send(form);
  });
}

function ConsentCard({ name, label, viewed, onOpen }: { name: string; label: string; viewed: boolean; onOpen: () => void }) {
  return (
    <div className={viewed ? "consent-card ready" : "consent-card"}>
      <div>
        <b>{viewed ? "อ่านรายละเอียดแล้ว" : "กรุณาเปิดอ่านรายละเอียดก่อน"}</b>
        <p>{label}</p>
      </div>
      <button className="secondary" type="button" onClick={onOpen}><ScrollText />เปิดอ่าน</button>
      <label className="consent">
        <input type="checkbox" name={name} value="true" required disabled={!viewed} />
        {viewed ? "ยินยอมตามรายละเอียดข้างต้น" : "ยังไม่สามารถติ๊กได้จนกว่าจะเปิดอ่าน"}
      </label>
    </div>
  );
}
