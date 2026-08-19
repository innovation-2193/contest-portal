"use client";

import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { Download, FileSpreadsheet, FileText, History, Save, Trash2, Trophy, Upload, Users } from "lucide-react";
import { defaultCommitteeJudgeProfiles, type CommitteeJudgeProfile } from "../lib/committee-score-config";

type CommitteeSummaryRow = {
  rank: number;
  submissionCode: string;
  submissionTitle: string;
  submissionTitleEnglish?: string | null;
  averageScore: number | null;
  judgeCount: number;
};

type CommitteeReportVersion = {
  id: string;
  version: number;
  sourceFileName: string;
  createdByEmail: string;
  createdAt: string;
  rows?: CommitteeSummaryRow[];
};

export function CommitteeScoreImportPanel() {
  const [profiles, setProfiles] = useState<CommitteeJudgeProfile[]>(() => defaultCommitteeJudgeProfiles());
  const [rows, setRows] = useState<CommitteeSummaryRow[]>([]);
  const [versions, setVersions] = useState<CommitteeReportVersion[]>([]);
  const [versionTotal, setVersionTotal] = useState(0);
  const [showAllVersions, setShowAllVersions] = useState(false);
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
      const [profileResponse, summaryResponse, versionResponse] = await Promise.all([
        fetch("/api/admin/committee-scores", { cache: "no-store" }),
        fetch("/api/admin/committee-scores/summary", { cache: "no-store" }),
        fetch("/api/admin/committee-scores/versions", { cache: "no-store" }),
      ]);
      const profilePayload = await profileResponse.json() as { ok?: boolean; judgeProfiles?: CommitteeJudgeProfile[]; message?: string };
      const summaryPayload = await summaryResponse.json() as { ok?: boolean; rows?: CommitteeSummaryRow[]; message?: string };
      const versionPayload = await versionResponse.json() as { ok?: boolean; versions?: CommitteeReportVersion[]; total?: number };
      if (!profileResponse.ok || !profilePayload.ok) throw new Error(profilePayload.message || "โหลดข้อมูลกรรมการไม่สำเร็จ");
      setProfiles(profilePayload.judgeProfiles?.length ? profilePayload.judgeProfiles : defaultCommitteeJudgeProfiles());
      setRows(summaryPayload.rows ?? []);
      setVersions(versionPayload.versions ?? []);
      setVersionTotal(versionPayload.total ?? 0);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "โหลดข้อมูลคะแนนไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  async function loadAllVersions() {
    setWorking(true);
    try {
      const response = await fetch("/api/admin/committee-scores/versions?all=1", { cache: "no-store" });
      const payload = await response.json() as { ok?: boolean; versions?: CommitteeReportVersion[]; total?: number; message?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.message || "โหลด Version รายงานไม่สำเร็จ");
      setVersions(payload.versions ?? []);
      setVersionTotal(payload.total ?? 0);
      setShowAllVersions(true);
    } catch (versionError) {
      setError(versionError instanceof Error ? versionError.message : "โหลด Version รายงานไม่สำเร็จ");
    } finally {
      setWorking(false);
    }
  }

  async function deleteVersion(version: CommitteeReportVersion) {
    if (!window.confirm(`ยืนยันลบ Report PDF Version ${version.version}? ไฟล์เวอร์ชันนี้จะเปิดดูไม่ได้อีก`)) return;
    setWorking(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/committee-scores/versions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: version.id }),
      });
      const payload = await response.json() as { ok?: boolean; message?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.message || "ลบ Version รายงานไม่สำเร็จ");
      setShowAllVersions(false);
      setMessage(`ลบ Report PDF Version ${version.version} เรียบร้อยแล้ว`);
      await loadData();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "ลบ Version รายงานไม่สำเร็จ");
    } finally {
      setWorking(false);
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
      const payload = await response.json() as { ok?: boolean; message?: string; errors?: string[]; reportUrl?: string; reportVersion?: number };
      if (!response.ok || !payload.ok) throw new Error([payload.message, ...(payload.errors?.slice(0, 3) ?? [])].filter(Boolean).join("\n"));
      setMessage(`${payload.message || "นำเข้าคะแนนเรียบร้อยแล้ว"}\nบันทึกเป็น Version ${payload.reportVersion ?? "ใหม่"} และกำลังเปิดรายงาน PDF ให้`);
      await loadData();
      if (reportWindow) reportWindow.location.href = payload.reportUrl || "/api/admin/committee-scores/export";
    } catch (importError) {
      reportWindow?.close();
      setError(importError instanceof Error ? importError.message : "นำเข้าคะแนนไม่สำเร็จ");
    } finally {
      setWorking(false);
    }
  }

  async function importConsensusFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setWorking(true);
    setError("");
    setMessage("");
    const formData = new FormData();
    formData.append("file", file);
    try {
      const response = await fetch("/api/admin/committee-scores/consensus-import", { method: "POST", body: formData });
      const payload = await response.json() as { ok?: boolean; message?: string; errors?: string[] };
      if (!response.ok || !payload.ok) throw new Error([payload.message, ...(payload.errors?.slice(0, 3) ?? [])].filter(Boolean).join("\n"));
      setMessage(payload.message || "นำเข้าคะแนนทางเลือกที่ 2 เรียบร้อยแล้ว");
      await loadData();
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "นำเข้าคะแนนทางเลือกที่ 2 ไม่สำเร็จ");
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
    <div className="committee-score-actions committee-score-main-actions"><a className="secondary" href="/api/admin/committee-scores/template"><FileSpreadsheet/>ดาวน์โหลด Template Excel</a><label className="secondary committee-upload-button"><Upload/>อัปโหลดไฟล์คะแนน<input type="file" accept=".xlsx,.csv" onChange={importFile} disabled={working}/></label><a className="primary" href="/api/admin/committee-scores/export" target="_blank" rel="noreferrer"><Download/>Export รายงานจัดอันดับ PDF</a><a className="secondary" href="/api/admin/committee-scores/export/xlsx"><FileSpreadsheet/>Export Top 10 + ที่เหลือ Excel</a></div>
    <div className="committee-score-actions committee-score-consensus-actions"><a className="secondary" href="/api/admin/committee-scores/consensus-template"><FileSpreadsheet/>Template Excel ทางเลือกที่ 2</a><label className="secondary committee-upload-button"><Upload/>Import คะแนนทางเลือกที่ 2<input type="file" accept=".xlsx,.csv" onChange={importConsensusFile} disabled={working}/></label><a className="primary" href="/api/admin/committee-scores/consensus-export" target="_blank" rel="noreferrer"><Download/>แบบฟอร์มคะแนน PDF ทางเลือกที่ 2</a></div>
    <div className="committee-score-option-label"><b>ทางเลือกที่ 3 — คะแนนหยาบ 5 ด้าน</b><span>ปริ้นท์แบบฟอร์มให้กรรมการลงนามร่วมกัน แล้ว Import Excel เพื่อออกรายงานจัดอันดับ</span></div>
    <div className="committee-score-actions committee-score-option3-actions"><a className="secondary" href="/api/admin/committee-scores/consensus-template"><FileSpreadsheet/>Template Excel ทางเลือกที่ 3</a><label className="secondary committee-upload-button"><Upload/>Import คะแนนทางเลือกที่ 3<input type="file" accept=".xlsx,.csv" onChange={importConsensusFile} disabled={working}/></label><a className="secondary" href="/api/admin/committee-scores/coarse-form" target="_blank" rel="noreferrer"><FileText/>แบบฟอร์มกรอกคะแนน PDF</a><a className="primary" href="/api/admin/committee-scores/consensus-report" target="_blank" rel="noreferrer"><Download/>Report PDF เรียงคะแนน</a></div>
    <div className="committee-score-report-versions"><div className="committee-summary-heading"><div><h3><History/>Report PDF ตาม Version</h3><p>แสดง {Math.min(versions.length, 3).toLocaleString("th-TH")} Version ล่าสุด จากทั้งหมด {versionTotal.toLocaleString("th-TH")} Version</p></div><FileText/></div>{versions.length ? <div className="committee-report-version-list">{versions.map((version) => <article key={version.id}><div><b>Version {version.version}</b><span>{formatVersionDate(version.createdAt)} • {version.sourceFileName}</span></div><div className="committee-report-version-actions"><a className="secondary small-action" href={`/api/admin/committee-scores/export?versionId=${encodeURIComponent(version.id)}`} target="_blank" rel="noreferrer"><Download/>ดาวน์โหลด PDF</a><button className="danger-btn small-action" type="button" onClick={() => void deleteVersion(version)} disabled={working}><Trash2/>ลบ Version</button></div></article>)}</div> : <p className="participant-empty">เมื่อ Import Excel แล้ว ระบบจะบันทึก Report เป็น Version ไว้ตรงนี้</p>}{versionTotal > 3 && !showAllVersions && <button className="ghost-action" type="button" onClick={loadAllVersions} disabled={working}>ดูทั้งหมด ({versionTotal.toLocaleString("th-TH")} Version)</button>}{showAllVersions && versionTotal > 3 && <button className="ghost-action" type="button" onClick={() => { setShowAllVersions(false); setVersions((current) => current.slice(0, 3)); }}>แสดงเฉพาะ 3 Version ล่าสุด</button>}</div>
    <div className="committee-score-summary"><div className="committee-summary-heading"><div><h3>ตัวอย่างอันดับล่าสุด</h3><p>{rows.length ? `แสดง ${Math.min(rows.length, 10).toLocaleString("th-TH")} อันดับแรกจาก ${rows.length.toLocaleString("th-TH")} ผลงานที่มีคะแนน` : "ยังไม่มีคะแนนที่นำเข้า"}</p></div><Users/></div>{loading ? <p className="participant-empty">กำลังโหลดข้อมูลคะแนน...</p> : rows.length ? <div className="admin-table-wrap"><table className="admin-table committee-score-table"><thead><tr><th>อันดับ</th><th>ชื่อโครงการ</th><th>รหัสโครงการ</th><th>คะแนนที่ได้</th><th>หมายเหตุ</th></tr></thead><tbody>{rows.map((row) => <tr key={row.submissionCode}><td data-label="อันดับ"><b>{row.rank.toLocaleString("th-TH")}</b></td><td data-label="ชื่อโครงการ"><b>{row.submissionTitle}</b>{row.submissionTitleEnglish && <small>{row.submissionTitleEnglish}</small>}</td><td data-label="รหัสโครงการ">{row.submissionCode}</td><td data-label="คะแนนที่ได้"><strong>{row.averageScore?.toFixed(2)}</strong></td><td data-label="หมายเหตุ">{row.judgeCount === profiles.length ? "คะแนนครบ" : `กรอกแล้ว ${row.judgeCount}/${profiles.length} คน`}</td></tr>)}</tbody></table></div> : <p className="participant-empty">หลังจากอัปโหลดคะแนนแล้ว ระบบจะแสดงอันดับในส่วนนี้</p>}</div>
  </section>;
}

function formatVersionDate(value: string) {
  return new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
