"use client";

import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { Download, FileSpreadsheet, Save, Trophy, Upload, Users } from "lucide-react";
import { defaultCommitteeJudgeProfiles, type CommitteeJudgeProfile } from "../lib/committee-score-config";

type CommitteeSummaryRow = {
  rank: number;
  submissionCode: string;
  submissionTitle: string;
  averageScore: number | null;
  judgeCount: number;
};

export function CommitteeScoreImportPanel() {
  const [profiles, setProfiles] = useState<CommitteeJudgeProfile[]>(() => defaultCommitteeJudgeProfiles());
  const [rows, setRows] = useState<CommitteeSummaryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [profileResponse, summaryResponse] = await Promise.all([
        fetch("/api/admin/committee-scores", { cache: "no-store" }),
        fetch("/api/admin/committee-scores/summary", { cache: "no-store" }),
      ]);
      const profilePayload = await profileResponse.json() as { ok?: boolean; judgeProfiles?: CommitteeJudgeProfile[]; message?: string };
      const summaryPayload = await summaryResponse.json() as { ok?: boolean; rows?: CommitteeSummaryRow[]; message?: string };
      if (!profileResponse.ok || !profilePayload.ok) throw new Error(profilePayload.message || "โหลดข้อมูลกรรมการไม่สำเร็จ");
      setProfiles(profilePayload.judgeProfiles?.length ? profilePayload.judgeProfiles : defaultCommitteeJudgeProfiles());
      setRows(summaryPayload.rows ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "โหลดข้อมูลคะแนนไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  function updateProfile(index: number, field: keyof CommitteeJudgeProfile, value: string) {
    setProfiles((current) => current.map((profile, profileIndex) => profileIndex === index ? { ...profile, [field]: value } : profile));
  }

  async function saveProfiles(event: FormEvent) {
    event.preventDefault();
    setWorking(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/committee-scores", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ judgeProfiles: profiles }) });
      const payload = await response.json() as { ok?: boolean; message?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.message || "บันทึกชื่อกรรมการไม่สำเร็จ");
      setMessage("บันทึกชื่อกรรมการเรียบร้อยแล้ว และจะใช้ใน Template กับรายงาน PDF");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "บันทึกชื่อกรรมการไม่สำเร็จ");
    } finally {
      setWorking(false);
    }
  }

  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const reportWindow = window.open("about:blank", "_blank");
    setWorking(true);
    setError("");
    setMessage("");
    const formData = new FormData();
    formData.append("file", file);
    try {
      const response = await fetch("/api/admin/committee-scores/import", { method: "POST", body: formData });
      const payload = await response.json() as { ok?: boolean; message?: string; errors?: string[] };
      if (!response.ok || !payload.ok) throw new Error([payload.message, ...(payload.errors?.slice(0, 3) ?? [])].filter(Boolean).join("\n"));
      setMessage(`${payload.message || "นำเข้าคะแนนเรียบร้อยแล้ว"}\nระบบกำลังเปิดรายงาน PDF จัดอันดับให้`);
      await loadData();
      if (reportWindow) reportWindow.location.href = "/api/admin/committee-scores/export";
    } catch (importError) {
      reportWindow?.close();
      setError(importError instanceof Error ? importError.message : "นำเข้าคะแนนไม่สำเร็จ");
    } finally {
      setWorking(false);
    }
  }

  return <section className="admin-panel committee-score-import-panel">
    <header className="admin-section-head"><Trophy/><div><span className="eyebrow">Round 1 Committee Report</span><h2>รายงานจัดอันดับคะแนนคณะกรรมการ รอบที่ 1</h2><p>กำหนดชื่อกรรมการ ดาวน์โหลด Template กรอกคะแนน แล้วอัปโหลดไฟล์เดิมเพื่อสรุปอันดับจากคะแนนเฉลี่ย</p></div></header>
    {(message || error) && <div className={`committee-score-feedback ${error ? "is-error" : "is-success"}`} role="status">{(error || message).split("\n").map((line, index) => <span key={`${line}-${index}`}>{line}</span>)}</div>}
    <form className="committee-judge-form" onSubmit={saveProfiles}>
      <div className="committee-judge-grid">{profiles.map((profile, index) => <fieldset key={profile.judgeKey}><legend>กรรมการ {index + 1}</legend><div className="committee-judge-fields"><label>คำนำหน้า<input value={profile.prefix} onChange={(event) => updateProfile(index, "prefix", event.target.value)} placeholder="เช่น พล.ต.ต."/></label><label>ชื่อ<input value={profile.firstName} onChange={(event) => updateProfile(index, "firstName", event.target.value)} required/></label><label>นามสกุล<input value={profile.lastName} onChange={(event) => updateProfile(index, "lastName", event.target.value)} required/></label><label className="committee-judge-position">ตำแหน่ง / หน่วยงาน<input value={profile.position} onChange={(event) => updateProfile(index, "position", event.target.value)} placeholder="ถ้ามี"/></label></div></fieldset>)}</div>
      <button className="primary" type="submit" disabled={working || loading}><Save/>บันทึกชื่อกรรมการ</button>
    </form>
    <div className="committee-score-actions"><a className="secondary" href="/api/admin/committee-scores/template"><FileSpreadsheet/>ดาวน์โหลด Template Excel</a><label className="secondary committee-upload-button"><Upload/>อัปโหลดไฟล์คะแนน<input type="file" accept=".xlsx,.csv" onChange={importFile} disabled={working}/></label><a className="primary" href="/api/admin/committee-scores/export" target="_blank" rel="noreferrer"><Download/>Export รายงานจัดอันดับ PDF</a></div>
    <div className="committee-score-summary"><div className="committee-summary-heading"><div><h3>ตัวอย่างอันดับล่าสุด</h3><p>{rows.length ? `แสดง ${Math.min(rows.length, 10).toLocaleString("th-TH")} อันดับแรกจาก ${rows.length.toLocaleString("th-TH")} ผลงานที่มีคะแนน` : "ยังไม่มีคะแนนที่นำเข้า"}</p></div><Users/></div>{loading ? <p className="participant-empty">กำลังโหลดข้อมูลคะแนน...</p> : rows.length ? <div className="admin-table-wrap"><table className="admin-table committee-score-table"><thead><tr><th>อันดับ</th><th>ชื่อโครงการ</th><th>รหัสโครงการ</th><th>คะแนนเฉลี่ย</th><th>หมายเหตุ</th></tr></thead><tbody>{rows.map((row) => <tr key={row.submissionCode}><td data-label="อันดับ"><b>{row.rank.toLocaleString("th-TH")}</b></td><td data-label="ชื่อโครงการ">{row.submissionTitle}</td><td data-label="รหัสโครงการ">{row.submissionCode}</td><td data-label="คะแนนเฉลี่ย"><strong>{row.averageScore?.toFixed(2)}</strong></td><td data-label="หมายเหตุ">{row.judgeCount === profiles.length ? "คะแนนครบ" : `กรอกแล้ว ${row.judgeCount}/${profiles.length} คน`}</td></tr>)}</tbody></table></div> : <p className="participant-empty">หลังจากอัปโหลดคะแนนแล้ว ระบบจะแสดงอันดับในส่วนนี้</p>}</div>
  </section>;
}
