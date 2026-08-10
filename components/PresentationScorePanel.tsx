"use client";

import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { Download, FileText, Plus, Save, Trash2, Trophy, Upload, Users } from "lucide-react";

type JudgeProfile = {
  judgeKey: string;
  prefix: string;
  firstName: string;
  lastName: string;
  position: string;
  role: string;
};

type ScoreRow = {
  rank: number;
  submissionCode: string;
  submissionTitle: string;
  round1Average: number | null;
  weightedRound1: number | null;
  presentationAverage: number | null;
  weightedPresentation: number | null;
  finalScore: number | null;
  judgeCount: number;
};

export function PresentationScorePanel() {
  const [profiles, setProfiles] = useState<JudgeProfile[]>([]);
  const [rows, setRows] = useState<ScoreRow[]>([]);
  const [finalistCount, setFinalistCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => { void loadData(); }, []);

  async function loadData() {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/presentation-scores", { cache: "no-store" });
      const payload = await response.json() as { ok?: boolean; profiles?: JudgeProfile[]; rows?: ScoreRow[]; finalists?: unknown[]; message?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.message || "โหลดข้อมูลรอบที่ 2 ไม่สำเร็จ");
      setProfiles(payload.profiles ?? []);
      setRows(payload.rows ?? []);
      setFinalistCount(payload.finalists?.length ?? 0);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "โหลดข้อมูลรอบที่ 2 ไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  function updateProfile(index: number, field: keyof JudgeProfile, value: string) {
    setProfiles((current) => current.map((profile, profileIndex) => profileIndex === index ? { ...profile, [field]: value } : profile));
  }

  function addProfile() {
    setProfiles((current) => [...current, { judgeKey: `r2-${Date.now()}`, prefix: "", firstName: "", lastName: "", position: "", role: "กรรมการ" }]);
  }

  function removeProfile(index: number) {
    setProfiles((current) => current.length <= 1 ? current : current.filter((_, profileIndex) => profileIndex !== index));
  }

  async function saveProfiles(event: FormEvent) {
    event.preventDefault();
    setWorking(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/presentation-scores", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profiles }) });
      const payload = await response.json() as { ok?: boolean; savedProfiles?: JudgeProfile[]; message?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.message || "บันทึกรายชื่อกรรมการไม่สำเร็จ");
      setProfiles(payload.savedProfiles ?? profiles);
      setMessage("บันทึกรายชื่อกรรมการรอบที่ 2 เรียบร้อยแล้ว");
      await loadData();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "บันทึกรายชื่อกรรมการไม่สำเร็จ");
    } finally {
      setWorking(false);
    }
  }

  async function importScores(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setWorking(true);
    setError("");
    setMessage("");
    const formData = new FormData();
    formData.append("file", file);
    try {
      const response = await fetch("/api/admin/presentation-scores/import", { method: "POST", body: formData });
      const payload = await response.json() as { ok?: boolean; message?: string; errors?: string[] };
      if (!response.ok || !payload.ok) throw new Error([payload.message, ...(payload.errors ?? []).slice(0, 3)].filter(Boolean).join("\n"));
      setMessage(payload.message || "นำเข้าคะแนนรอบที่ 2 เรียบร้อยแล้ว");
      await loadData();
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "นำเข้าคะแนนไม่สำเร็จ");
    } finally {
      setWorking(false);
    }
  }

  return <section className="admin-panel committee-score-import-panel presentation-score-panel" id="presentation-score-form2">
    <header className="admin-section-head"><Trophy/><div><span className="eyebrow">Round 2 Presentation</span><h2>แบบฟอร์มกรอกคะแนนประกวดนวัตกรรม รอบที่ 2</h2><p>ใช้เฉพาะผลงานที่ Super Admin เพิ่มไว้ในประกาศผลการแข่งขัน • รอบที่ 1 น้ำหนัก 40% • รอบที่ 2 น้ำหนัก 60%</p></div></header>
    {(message || error) && <div className={`committee-score-feedback ${error ? "is-error" : "is-success"}`} role="status">{error || message}</div>}
    <form className="committee-judge-form" onSubmit={saveProfiles}>
      <div className="committee-score-panel-subhead"><div><h3><Users/>คณะกรรมการรอบที่ 2</h3><p>เพิ่ม แก้ไข หรือลบรายชื่อกรรมการได้ตามต้องการ</p></div><button className="secondary small-action" type="button" onClick={addProfile}><Plus/>เพิ่มกรรมการ</button></div>
      <div className="committee-judge-grid">{profiles.map((profile, index) => <fieldset key={profile.judgeKey}><legend>กรรมการ {index + 1}<button className="ghost-action" type="button" onClick={() => removeProfile(index)} disabled={profiles.length <= 1}><Trash2/>ลบ</button></legend><div className="committee-judge-fields"><label>คำนำหน้า<input value={profile.prefix} onChange={(event) => updateProfile(index, "prefix", event.target.value)} placeholder="เช่น พลตำรวจโท"/></label><label>ชื่อ<input value={profile.firstName} onChange={(event) => updateProfile(index, "firstName", event.target.value)} required/></label><label>นามสกุล<input value={profile.lastName} onChange={(event) => updateProfile(index, "lastName", event.target.value)} required/></label><label>บทบาท<input value={profile.role} onChange={(event) => updateProfile(index, "role", event.target.value)} required/></label><label className="committee-judge-position">ตำแหน่ง / หน่วยงาน<input value={profile.position} onChange={(event) => updateProfile(index, "position", event.target.value)} placeholder="ถ้ามี"/></label></div></fieldset>)}</div>
      <button className="primary" type="submit" disabled={working || loading}><Save/>บันทึกรายชื่อกรรมการรอบที่ 2</button>
    </form>
    <div className="committee-score-actions"><a className="primary" href="/api/admin/presentation-scores/form"><FileText/><span>PDF แบบฟอร์มรอบที่ 2</span></a><a className="secondary" href="/api/admin/presentation-scores/report"><FileText/><span>PDF Report คะแนนถ่วงน้ำหนัก</span></a><a className="secondary" href="/api/admin/presentation-scores/template"><Download/><span>Template คะแนนรอบที่ 2</span></a><label className="secondary committee-upload-button"><Upload/><span>อัปโหลดคะแนนรอบที่ 2</span><input type="file" accept=".xlsx,.csv" onChange={importScores} disabled={working || loading}/></label></div>
    <div className="committee-score-summary"><div className="committee-summary-heading"><div><h3>สรุปคะแนนถ่วงน้ำหนัก</h3><p>{loading ? "กำลังโหลดข้อมูล..." : `แสดง ${finalistCount.toLocaleString("th-TH")} ผลงานจากประกาศผลการแข่งขัน`}</p></div><Trophy/></div>{!loading && !rows.length ? <p className="participant-empty">ยังไม่มีผลงานในประกาศผลการแข่งขัน หรือยังไม่พบคะแนนรอบที่ 1</p> : <div className="admin-table-wrap"><table className="admin-table committee-score-table presentation-score-table"><thead><tr><th>ลำดับ</th><th>ผลงาน</th><th>รอบที่ 1 × 40%</th><th>รอบที่ 2 × 60%</th><th>รวม</th><th>กรรมการ</th></tr></thead><tbody>{rows.map((row) => <tr key={row.submissionCode}><td data-label="ลำดับ"><b>{row.rank.toLocaleString("th-TH")}</b></td><td data-label="ผลงาน"><b>{row.submissionTitle}</b><small>{row.submissionCode}</small></td><td data-label="รอบที่ 1 × 40%">{displayScore(row.weightedRound1)}</td><td data-label="รอบที่ 2 × 60%">{displayScore(row.weightedPresentation)}</td><td data-label="รวม"><strong>{displayScore(row.finalScore)}</strong></td><td data-label="กรรมการ">{row.judgeCount}/{profiles.length}</td></tr>)}</tbody></table></div>}</div>
  </section>;
}

function displayScore(value: number | null) {
  return value === null ? "-" : value.toFixed(2);
}
