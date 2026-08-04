"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Calculator, CheckCircle2, FileSpreadsheet, Loader2, Save, Search, Trash2, Upload, XCircle } from "lucide-react";
import { committeeJudges } from "../lib/committee-score-config";

export type ScoreSubmissionOption = {
  code: string;
  title: string;
  order: number;
  ownerName?: string;
  division?: string;
};

type ScoreRecord = {
  id: string;
  submissionCode: string;
  submissionTitle: string;
  submissionOrder: number;
  judgeKey: string;
  judgeName: string;
  calculatedTotal: number;
  declaredTotal: number | null;
  updatedAt: string;
};

type SubmitState = {
  status: "idle" | "loading" | "saving" | "saved" | "error";
  message: string;
  details?: string[];
};

type ScoreGrid = Record<string, Record<string, string>>;
type RecordGrid = Record<string, Record<string, ScoreRecord>>;

export function CommitteeScoreEntryClient({ submissions: initialSubmissions = [] }: { submissions?: ScoreSubmissionOption[] }) {
  const [submissions, setSubmissions] = useState(initialSubmissions);
  const [scores, setScores] = useState<ScoreGrid>({});
  const [savedRecords, setSavedRecords] = useState<RecordGrid>({});
  const [dirtyCells, setDirtyCells] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [state, setState] = useState<SubmitState>({ status: "loading", message: "กำลังโหลดข้อมูลคะแนน" });
  const [importFile, setImportFile] = useState<File | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (initialSubmissions.length) return;
    let alive = true;
    fetch("/api/admin/committee-scores/submissions", { cache: "no-store" })
      .then((response) => response.json())
      .then((payload: { ok?: boolean; submissions?: ScoreSubmissionOption[]; message?: string }) => {
        if (!alive) return;
        if (payload.ok && Array.isArray(payload.submissions)) {
          setSubmissions(payload.submissions);
        } else {
          setState({ status: "error", message: payload.message ?? "โหลดรายการผลงานไม่สำเร็จ" });
        }
      })
      .catch((error) => {
        if (!alive) return;
        setState({ status: "error", message: error instanceof Error ? error.message : "โหลดรายการผลงานไม่สำเร็จ" });
      });
    return () => {
      alive = false;
    };
  }, [initialSubmissions.length]);

  useEffect(() => {
    let alive = true;
    setState((current) => current.status === "saving" ? current : { status: "loading", message: "กำลังโหลดคะแนนที่บันทึกไว้" });
    fetch("/api/admin/committee-scores", { cache: "no-store" })
      .then((response) => response.json())
      .then((payload: { ok?: boolean; records?: ScoreRecord[]; message?: string }) => {
        if (!alive) return;
        if (!payload.ok || !Array.isArray(payload.records)) {
          setState({ status: "error", message: payload.message ?? "โหลดรายการคะแนนไม่สำเร็จ" });
          return;
        }
        const nextScores: ScoreGrid = {};
        const nextRecords: RecordGrid = {};
        for (const record of payload.records) {
          if (!record.submissionCode || !record.judgeKey) continue;
          nextScores[record.submissionCode] = nextScores[record.submissionCode] ?? {};
          nextRecords[record.submissionCode] = nextRecords[record.submissionCode] ?? {};
          nextScores[record.submissionCode][record.judgeKey] = scoreInputValue(record.calculatedTotal);
          nextRecords[record.submissionCode][record.judgeKey] = record;
        }
        setScores(nextScores);
        setSavedRecords(nextRecords);
        setDirtyCells(new Set());
        setState({
          status: "idle",
          message: payload.records.length
            ? `โหลดคะแนนแล้ว ${payload.records.length.toLocaleString("th-TH")} รายการ`
            : "ยังไม่มีคะแนนคณะกรรมการที่บันทึกไว้",
        });
      })
      .catch((error) => {
        if (!alive) return;
        setState({ status: "error", message: error instanceof Error ? error.message : "โหลดรายการคะแนนไม่สำเร็จ" });
      });
    return () => {
      alive = false;
    };
  }, [refreshKey]);

  const visibleSubmissions = useMemo(() => {
    const normalized = normalizeSearch(query);
    if (!normalized) return submissions;
    return submissions.filter((submission) => normalizeSearch([
      submission.code,
      submission.title,
      submission.ownerName,
      submission.division,
      String(submission.order),
    ].filter(Boolean).join(" ")).includes(normalized));
  }, [query, submissions]);

  const stats = useMemo(() => {
    let filled = 0;
    let completeRows = 0;
    for (const submission of submissions) {
      const row = scores[submission.code] ?? {};
      const count = committeeJudges.filter((judge) => nullableNumber(row[judge.key]) !== null).length;
      filled += count;
      if (count === committeeJudges.length) completeRows += 1;
    }
    return {
      filled,
      completeRows,
      totalCells: submissions.length * committeeJudges.length,
    };
  }, [scores, submissions]);

  function updateScore(submissionCode: string, judgeKey: string, value: string) {
    const cleaned = cleanScoreText(value);
    setScores((current) => ({
      ...current,
      [submissionCode]: {
        ...(current[submissionCode] ?? {}),
        [judgeKey]: cleaned,
      },
    }));
    setDirtyCells((current) => {
      const next = new Set(current);
      next.add(cellKey(submissionCode, judgeKey));
      return next;
    });
    setState({ status: "idle", message: "" });
  }

  async function saveScores() {
    const dirty = [...dirtyCells];
    if (!dirty.length) {
      setState({ status: "idle", message: "ยังไม่มีช่องคะแนนที่เปลี่ยนแปลง" });
      return;
    }

    const records = [];
    const deletes: ScoreRecord[] = [];

    for (const key of dirty) {
      const [submissionCode, judgeKey] = key.split(":");
      const submission = submissions.find((item) => item.code === submissionCode);
      const value = nullableNumber(scores[submissionCode]?.[judgeKey]);
      const existing = savedRecords[submissionCode]?.[judgeKey];
      if (!submission) continue;
      if (value === null) {
        if (existing) deletes.push(existing);
        continue;
      }
      records.push({
        submissionCode,
        submissionTitle: submission.title,
        submissionOrder: submission.order,
        judgeKey,
        sourceFileName: "manual-total-score",
        sourcePage: 1,
        itemScores: {},
        totalScore: value,
        declaredTotal: value,
        note: "Manual total score entry",
      });
    }

    setState({ status: "saving", message: "กำลังบันทึกคะแนนรวม" });

    try {
      if (records.length) {
        const response = await fetch("/api/admin/committee-scores", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ records }),
        });
        const result = await response.json().catch(() => ({ ok: false, message: "ไม่สามารถอ่านผลลัพธ์จากระบบได้" }));
        if (!response.ok || !result.ok) throw new Error(result.message ?? "บันทึกคะแนนไม่สำเร็จ");
      }

      for (const record of deletes) {
        const response = await fetch("/api/admin/committee-scores", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recordId: record.id }),
        });
        const result = await response.json().catch(() => ({ ok: false, message: "ไม่สามารถอ่านผลลัพธ์จากระบบได้" }));
        if (!response.ok || !result.ok) throw new Error(result.message ?? "ลบคะแนนไม่สำเร็จ");
      }

      setState({
        status: "saved",
        message: `บันทึกแล้ว ${records.length.toLocaleString("th-TH")} รายการ${deletes.length ? ` และลบ ${deletes.length.toLocaleString("th-TH")} รายการ` : ""}`,
      });
      setRefreshKey((value) => value + 1);
    } catch (error) {
      setState({ status: "error", message: error instanceof Error ? error.message : "บันทึกคะแนนไม่สำเร็จ" });
    }
  }

  async function importScores(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!importFile) {
      setState({ status: "error", message: "กรุณาเลือกไฟล์คะแนน Excel ก่อนนำเข้า" });
      return;
    }

    const formData = new FormData();
    formData.set("file", importFile);
    setState({ status: "saving", message: "กำลังนำเข้าคะแนนจาก Excel" });

    try {
      const response = await fetch("/api/admin/committee-scores/import", {
        method: "POST",
        body: formData,
      });
      const result = await response.json().catch(() => ({ ok: false, message: "ไม่สามารถอ่านผลลัพธ์จากระบบได้" }));
      if (!response.ok || !result.ok) {
        setState({
          status: "error",
          message: result.message ?? "นำเข้าคะแนนไม่สำเร็จ",
          details: Array.isArray(result.errors) ? result.errors : [],
        });
        return;
      }
      setImportFile(null);
      setState({ status: "saved", message: result.message ?? "นำเข้าคะแนนเรียบร้อยแล้ว" });
      setRefreshKey((value) => value + 1);
    } catch (error) {
      setState({ status: "error", message: error instanceof Error ? error.message : "นำเข้าคะแนนไม่สำเร็จ" });
    }
  }

  function clearAllDirty() {
    setScores((current) => {
      const next = { ...current };
      for (const key of dirtyCells) {
        const [submissionCode, judgeKey] = key.split(":");
        const original = savedRecords[submissionCode]?.[judgeKey]?.calculatedTotal;
        next[submissionCode] = { ...(next[submissionCode] ?? {}) };
        if (typeof original === "number") next[submissionCode][judgeKey] = scoreInputValue(original);
        else delete next[submissionCode][judgeKey];
      }
      return next;
    });
    setDirtyCells(new Set());
    setState({ status: "idle", message: "ยกเลิกการแก้ไขที่ยังไม่ได้บันทึกแล้ว" });
  }

  return <div className="committee-score-workspace">
    <section className="admin-panel committee-score-entry-card">
      <header className="admin-section-head">
        <Calculator/>
        <div>
          <h2>กรอกคะแนนรวมคณะกรรมการ</h2>
          <p>กรอกคะแนนรวม 0-100 ของกรรมการแต่ละท่านต่อผลงาน ระบบจะคำนวณค่าเฉลี่ยและใช้ Export ผลคะแนนชุดเดิม</p>
        </div>
        <span className="status-pill">{stats.filled.toLocaleString("th-TH")}/{stats.totalCells.toLocaleString("th-TH")} ช่อง</span>
      </header>
      <div className="audit-filter-form committee-score-toolbar">
        <label>ค้นหาผลงาน
          <span className="input-with-icon"><Search/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="รหัส / ชื่อผลงาน / เจ้าของ / หน่วยงาน"/></span>
        </label>
        <div className="committee-score-stats">
          <span><b>{submissions.length.toLocaleString("th-TH")}</b><small>ผลงานทั้งหมด</small></span>
          <span><b>{stats.completeRows.toLocaleString("th-TH")}</b><small>ครบ 5 กรรมการ</small></span>
          <span><b>{dirtyCells.size.toLocaleString("th-TH")}</b><small>รอบันทึก</small></span>
        </div>
        <form className="committee-score-import-form" onSubmit={importScores}>
          <a className="secondary" href="/api/admin/committee-scores/template" target="_blank" rel="noreferrer"><FileSpreadsheet/>Template Excel</a>
          <label>ไฟล์ Excel
            <input
              type="file"
              accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
              onChange={(event) => setImportFile(event.currentTarget.files?.[0] ?? null)}
            />
          </label>
          <button className="secondary" type="submit" disabled={state.status === "saving" || !importFile}>
            {state.status === "saving" ? <Loader2 className="spin-icon"/> : <Upload/>}
            Import
          </button>
        </form>
        <div className="audit-filter-actions">
          <button className="secondary" type="button" disabled={!dirtyCells.size || state.status === "saving"} onClick={clearAllDirty}><Trash2/>ยกเลิก</button>
          <button className="primary" type="button" disabled={!dirtyCells.size || state.status === "saving"} onClick={saveScores}>
            {state.status === "saving" ? <Loader2 className="spin-icon"/> : <Save/>}
            {state.status === "saving" ? "กำลังบันทึก" : "บันทึกคะแนน"}
          </button>
        </div>
      </div>
      {state.message ? <div className={`committee-score-alert ${state.status}`}>
        {state.status === "error" ? <XCircle/> : <CheckCircle2/>}
        <span>{state.message}{state.details?.length ? <small>{state.details.join(" • ")}</small> : null}</span>
      </div> : null}
    </section>

    <section className="admin-panel committee-score-table-panel">
      <div className="committee-score-table-scroll">
        <table className="admin-table committee-score-entry-table">
          <thead>
            <tr>
              <th>ลำดับ</th>
              <th>รหัส</th>
              <th>ผลงาน</th>
              {committeeJudges.map((judge) => <th key={judge.key}>ก.{judge.order}</th>)}
              <th>เฉลี่ย</th>
              <th>ครบ</th>
            </tr>
          </thead>
          <tbody>
            {visibleSubmissions.map((submission) => {
              const row = scores[submission.code] ?? {};
              const rowScores = committeeJudges
                .map((judge) => nullableNumber(row[judge.key]))
                .filter((score): score is number => score !== null);
              const average = rowScores.length ? roundScore(rowScores.reduce((sum, score) => sum + score, 0) / rowScores.length) : null;
              return <tr key={submission.code}>
                <td data-label="ลำดับ"><b>{submission.order.toLocaleString("th-TH")}</b></td>
                <td data-label="รหัส">{submission.code}</td>
                <td data-label="ผลงาน"><strong>{submission.title}</strong><small>{[submission.ownerName, submission.division].filter(Boolean).join(" • ")}</small></td>
                {committeeJudges.map((judge) => {
                  const key = cellKey(submission.code, judge.key);
                  const dirty = dirtyCells.has(key);
                  const value = row[judge.key] ?? "";
                  return <td data-label={`ก.${judge.order}`} key={judge.key}>
                    <input
                      aria-label={`คะแนน ${submission.code} กรรมการ ${judge.order}`}
                      className={dirty ? "dirty" : ""}
                      type="number"
                      inputMode="decimal"
                      min={0}
                      max={100}
                      step="0.25"
                      value={value}
                      onChange={(event) => updateScore(submission.code, judge.key, event.target.value)}
                    />
                  </td>;
                })}
                <td data-label="เฉลี่ย"><b>{average === null ? "-" : average.toFixed(2)}</b></td>
                <td data-label="ครบ"><span className={`status-pill ${rowScores.length === committeeJudges.length ? "attended" : "registered"}`}>{rowScores.length}/5</span></td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>
      {!visibleSubmissions.length ? <div className="participant-empty">ไม่พบผลงานตามคำค้นหา</div> : null}
    </section>
  </div>;
}

function nullableNumber(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const score = Number(value);
  if (!Number.isFinite(score)) return null;
  return Math.min(Math.max(roundScore(score), 0), 100);
}

function scoreInputValue(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? String(roundScore(value)) : "";
}

function cleanScoreText(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const score = nullableNumber(trimmed);
  return score === null ? trimmed : String(score);
}

function roundScore(value: number) {
  return Math.round(value * 100) / 100;
}

function cellKey(submissionCode: string, judgeKey: string) {
  return `${submissionCode}:${judgeKey}`;
}

function normalizeSearch(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}
