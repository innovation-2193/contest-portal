"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, FileUp, Loader2, Save, Search, Trash2, XCircle } from "lucide-react";
import { committeeJudges, committeeScoreCriteria } from "../lib/committee-score-config";

export type OcrSubmissionOption = {
  code: string;
  title: string;
  order: number;
};

type PreviewPage = {
  id: string;
  fileName: string;
  sourcePage: number;
  submissionCode: string;
  scores: Record<string, string>;
  declaredTotal: string;
  note: string;
  imageUrl: string;
  status: "ready" | "ocr" | "done" | "error";
  message: string;
};

type SubmitState = {
  status: "idle" | "saving" | "saved" | "error";
  message: string;
};

type SavedScoreRecord = {
  id: string;
  submissionCode: string;
  submissionTitle: string;
  submissionOrder: number;
  judgeName: string;
  itemScores: Record<string, number | null>;
  calculatedTotal: number;
  declaredTotal: number | null;
  totalMismatch: number | null;
  note: string | null;
  updatedAt: string;
};

const groupLabels = [...new Map(committeeScoreCriteria.map((item) => [item.groupId, item.groupLabel])).entries()];

export function CommitteeScoreOcrClient({ submissions: initialSubmissions = [] }: { submissions?: OcrSubmissionOption[] }) {
  const [submissions, setSubmissions] = useState(initialSubmissions);
  const [submissionLoadMessage, setSubmissionLoadMessage] = useState(initialSubmissions.length ? "" : "กำลังโหลดรายการนวัตกรรม");
  const [judgeKey, setJudgeKey] = useState(committeeJudges[0]?.key ?? "1");
  const [pages, setPages] = useState<PreviewPage[]>([]);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState("");
  const [search, setSearch] = useState("");
  const [submitState, setSubmitState] = useState<SubmitState>({ status: "idle", message: "" });
  const [savedRecords, setSavedRecords] = useState<SavedScoreRecord[]>([]);
  const [recordsMessage, setRecordsMessage] = useState("กำลังโหลดรายการคะแนน OCR");
  const [recordsRefreshKey, setRecordsRefreshKey] = useState(0);
  const filteredSubmissions = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return submissions;
    return submissions.filter((item) => `${item.order} ${item.code} ${item.title}`.toLowerCase().includes(query));
  }, [search, submissions]);

  useEffect(() => {
    if (initialSubmissions.length) return;
    let alive = true;
    fetch("/api/admin/committee-scores/submissions", { cache: "no-store" })
      .then((response) => response.json())
      .then((payload: { ok?: boolean; submissions?: OcrSubmissionOption[]; message?: string }) => {
        if (!alive) return;
        if (payload.ok && Array.isArray(payload.submissions)) {
          setSubmissions(payload.submissions);
          setSubmissionLoadMessage(payload.submissions.length ? "" : "ยังไม่มีรายการนวัตกรรมในระบบ");
        } else {
          setSubmissionLoadMessage(payload.message ?? "โหลดรายการนวัตกรรมไม่สำเร็จ");
        }
      })
      .catch((error) => {
        if (!alive) return;
        setSubmissionLoadMessage(error instanceof Error ? error.message : "โหลดรายการนวัตกรรมไม่สำเร็จ");
      });
    return () => {
      alive = false;
    };
  }, [initialSubmissions.length]);

  useEffect(() => {
    let alive = true;
    fetch("/api/admin/committee-scores", { cache: "no-store" })
      .then((response) => response.json())
      .then((payload: { ok?: boolean; records?: SavedScoreRecord[]; message?: string }) => {
        if (!alive) return;
        if (payload.ok && Array.isArray(payload.records)) {
          setSavedRecords(payload.records.slice().sort((a, b) => safeTime(b.updatedAt) - safeTime(a.updatedAt)));
          setRecordsMessage(payload.records.length ? "" : "ยังไม่มีคะแนน OCR ที่บันทึกไว้");
        } else {
          setRecordsMessage(payload.message ?? "โหลดรายการคะแนน OCR ไม่สำเร็จ");
        }
      })
      .catch((error) => {
        if (!alive) return;
        setRecordsMessage(error instanceof Error ? error.message : "โหลดรายการคะแนน OCR ไม่สำเร็จ");
      });
    return () => {
      alive = false;
    };
  }, [recordsRefreshKey]);

  async function handleFiles(fileList: FileList | null) {
    const files = [...(fileList ?? [])];
    if (!files.length) return;
    setProcessing(true);
    setSubmitState({ status: "idle", message: "" });
    try {
      const imagePages: PreviewPage[] = [];
      for (const file of files) {
        setProgress(`เตรียมไฟล์ ${file.name}`);
        const canvases = file.type === "application/pdf"
          ? await renderPdfPages(file)
          : [await renderImageFile(file)];
        canvases.forEach((canvas, index) => {
          const defaultSubmission = submissions[imagePages.length] ?? submissions[0];
          imagePages.push({
            id: `${file.name}-${index + 1}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            fileName: file.name,
            sourcePage: index + 1,
            submissionCode: defaultSubmission?.code ?? "",
            scores: Object.fromEntries(committeeScoreCriteria.map((criterion) => [criterion.id, ""])) as Record<string, string>,
            declaredTotal: "",
            note: "",
            imageUrl: canvas.toDataURL("image/png"),
            status: "ready",
            message: "",
          });
        });
      }
      setPages(imagePages);
      await runOcr(imagePages);
    } catch (error) {
      setSubmitState({ status: "error", message: error instanceof Error ? error.message : "ไม่สามารถ OCR ไฟล์ได้" });
    } finally {
      setProcessing(false);
      setProgress("");
    }
  }

  async function runOcr(targetPages: PreviewPage[]) {
    if (!targetPages.length) return;
    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker("eng", 1, {
      logger: (message) => {
        if (message.status) setProgress(`${message.status} ${Math.round((message.progress || 0) * 100)}%`);
      },
    });
    await worker.setParameters({
      tessedit_char_whitelist: "0123456789./",
      preserve_interword_spaces: "1",
    });

    try {
      for (const page of targetPages) {
        setPages((current) => current.map((item) => item.id === page.id ? { ...item, status: "ocr", message: "กำลังอ่านคะแนน" } : item));
        const canvas = await imageUrlToCanvas(page.imageUrl);
        const nextScores: Record<string, string> = {};
        for (const criterion of committeeScoreCriteria) {
          const text = await recognizeCrop(worker, canvas, scoreCropRectangle(canvas, criterion.id));
          nextScores[criterion.id] = scoreFromText(text, criterion.max);
        }
        const totalText = await recognizeCrop(worker, canvas, summaryCropRectangle(canvas));
        setPages((current) => current.map((item) => item.id === page.id ? {
          ...item,
          scores: nextScores,
          declaredTotal: scoreFromText(totalText, 100),
          status: "done",
          message: "อ่านคะแนนแล้ว กรุณาตรวจทานก่อนบันทึก",
        } : item));
      }
    } finally {
      await worker.terminate();
    }
  }

  function updatePage(id: string, patch: Partial<PreviewPage>) {
    setPages((current) => current.map((page) => page.id === id ? { ...page, ...patch } : page));
  }

  function updateScore(pageId: string, scoreId: string, value: string) {
    setPages((current) => current.map((page) => page.id === pageId ? { ...page, scores: { ...page.scores, [scoreId]: value } } : page));
  }

  async function submitScores() {
    const records = pages.map((page) => {
      const submission = submissions.find((item) => item.code === page.submissionCode);
      return {
        submissionCode: page.submissionCode,
        submissionTitle: submission?.title ?? "",
        submissionOrder: submission?.order ?? 1,
        judgeKey,
        sourceFileName: page.fileName,
        sourcePage: page.sourcePage,
        itemScores: Object.fromEntries(committeeScoreCriteria.map((criterion) => [criterion.id, nullableNumber(page.scores[criterion.id])])),
        declaredTotal: nullableNumber(page.declaredTotal),
        note: page.note,
      };
    });

    if (!records.every((record) => record.submissionCode)) {
      setSubmitState({ status: "error", message: "กรุณาเลือกนวัตกรรมให้ครบทุกหน้า" });
      return;
    }

    setSubmitState({ status: "saving", message: "กำลังบันทึกคะแนน" });
    const response = await fetch("/api/admin/committee-scores", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ records }),
    });
    const result = await response.json().catch(() => ({ ok: false, message: "ไม่สามารถอ่านผลลัพธ์จากระบบได้" }));
    if (!response.ok || !result.ok) {
      setSubmitState({ status: "error", message: result.message ?? "บันทึกคะแนนไม่สำเร็จ" });
      return;
    }
    setSubmitState({ status: "saved", message: `บันทึกคะแนนแล้ว ${records.length.toLocaleString("th-TH")} หน้า โดยใช้ข้อมูลล่าสุดแทนคะแนนเดิมของโครงการ/ผู้พิจารณาเดียวกัน` });
    setRecordsRefreshKey((value) => value + 1);
  }

  function patchSavedRecord(recordId: string, patch: Partial<SavedScoreRecord>) {
    setSavedRecords((current) => current.map((record) => record.id === recordId ? { ...record, ...patch } : record));
  }

  function patchSavedScore(recordId: string, scoreId: string, value: string) {
    setSavedRecords((current) => current.map((record) => record.id === recordId ? {
      ...record,
      itemScores: { ...record.itemScores, [scoreId]: nullableNumber(value) },
    } : record));
  }

  async function saveSavedRecord(record: SavedScoreRecord) {
    setRecordsMessage("กำลังบันทึกการแก้ไข");
    const response = await fetch("/api/admin/committee-scores", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recordId: record.id,
        itemScores: record.itemScores,
        declaredTotal: record.declaredTotal,
        note: record.note,
      }),
    });
    const result = await response.json().catch(() => ({ ok: false, message: "ไม่สามารถอ่านผลลัพธ์จากระบบได้" }));
    if (!response.ok || !result.ok) {
      setRecordsMessage(result.message ?? "บันทึกการแก้ไขไม่สำเร็จ");
      return;
    }
    setRecordsMessage("บันทึกการแก้ไขแล้ว");
    setRecordsRefreshKey((value) => value + 1);
  }

  async function deleteSavedRecord(record: SavedScoreRecord) {
    if (!window.confirm(`ยืนยันลบคะแนน OCR ของ ${record.judgeName} ในโครงการ ${record.submissionCode}?`)) return;
    setRecordsMessage("กำลังลบคะแนน");
    const response = await fetch("/api/admin/committee-scores", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recordId: record.id }),
    });
    const result = await response.json().catch(() => ({ ok: false, message: "ไม่สามารถอ่านผลลัพธ์จากระบบได้" }));
    if (!response.ok || !result.ok) {
      setRecordsMessage(result.message ?? "ลบคะแนนไม่สำเร็จ");
      return;
    }
    setSavedRecords((current) => current.filter((item) => item.id !== record.id));
    setRecordsMessage("ลบคะแนนแล้ว");
    setRecordsRefreshKey((value) => value + 1);
  }

  return <div className="committee-ocr-workspace">
    <section className="admin-panel committee-ocr-card">
      <header className="admin-section-head">
        <FileUp/>
        <div>
          <h2>OCR คะแนน</h2>
          <p>อัปโหลดไฟล์แบบฟอร์มที่กรรมการเขียนคะแนนแล้ว ระบบจะอ่านคะแนนรายข้อและให้ตรวจทานก่อนบันทึก หากอัปโหลดซ้ำโครงการเดิมของผู้พิจารณาคนเดิม ระบบจะใช้ข้อมูลล่าสุด</p>
        </div>
      </header>
      <div className="audit-filter-form committee-ocr-form">
        <label>ผู้พิจารณา
          <select value={judgeKey} onChange={(event) => setJudgeKey(event.target.value)} disabled={processing}>
            {committeeJudges.map((judge) => <option key={judge.key} value={judge.key}>{judge.rank}{judge.name} • {judge.role}</option>)}
          </select>
        </label>
        <label className="audit-filter-search">ค้นหานวัตกรรมใน preview
          <div><Search/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ค้นชื่อ รหัส SUB หรือลำดับ"/></div>
        </label>
        <label className="committee-ocr-upload">ไฟล์คะแนน
          <input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" multiple disabled={processing} onChange={(event) => handleFiles(event.currentTarget.files)}/>
        </label>
        <div className="audit-filter-actions">
          <button className="primary" type="button" disabled={processing || !pages.length} onClick={submitScores}><Save/>{submitState.status === "saving" ? "กำลังบันทึก" : "บันทึกผล OCR"}</button>
        </div>
        <p>{processing ? <Loader2 className="spin-icon"/> : <CheckCircle2/>}{processing ? progress || "กำลัง OCR" : submissionLoadMessage || "ระบบจะแยก preview ตามไฟล์/หน้า และตรวจผลรวมกับช่องสรุปคะแนนให้อัตโนมัติ"}</p>
      </div>
      {submitState.message && <div className={`committee-ocr-alert ${submitState.status}`}>{submitState.status === "error" ? <XCircle/> : <CheckCircle2/>}{submitState.message}</div>}
    </section>

    {pages.map((page, index) => <PreviewCard
      key={page.id}
      page={page}
      index={index}
      submissions={filteredSubmissions}
      updatePage={updatePage}
      updateScore={updateScore}
    />)}

    <SavedRecordsPanel
      records={savedRecords}
      message={recordsMessage}
      patchRecord={patchSavedRecord}
      patchScore={patchSavedScore}
      saveRecord={saveSavedRecord}
      deleteRecord={deleteSavedRecord}
    />
  </div>;
}

function SavedRecordsPanel({
  records,
  message,
  patchRecord,
  patchScore,
  saveRecord,
  deleteRecord,
}: {
  records: SavedScoreRecord[];
  message: string;
  patchRecord: (recordId: string, patch: Partial<SavedScoreRecord>) => void;
  patchScore: (recordId: string, scoreId: string, value: string) => void;
  saveRecord: (record: SavedScoreRecord) => void;
  deleteRecord: (record: SavedScoreRecord) => void;
}) {
  return <section className="admin-panel committee-records-panel">
    <header className="admin-section-head">
      <FileUp/>
      <div>
        <h2>รายการคะแนน OCR ที่บันทึกแล้ว</h2>
        <p>แก้ไขคะแนนรายข้อ สรุปคะแนน หมายเหตุ หรือลบคะแนนของผู้พิจารณาแต่ละท่านได้</p>
      </div>
      <span className="status-pill">{records.length.toLocaleString("th-TH")} รายการ</span>
    </header>
    {message ? <div className="committee-ocr-alert saved"><CheckCircle2/>{message}</div> : null}
    <div className="committee-record-list">
      {records.length ? records.map((record) => <details className="committee-record-card" key={record.id}>
        <summary>
          <span><b>{record.submissionTitle}</b><small>{record.submissionCode} • รายการที่ {record.submissionOrder.toLocaleString("th-TH")} • {record.judgeName}</small></span>
          <em className={`status-pill ${record.totalMismatch ? "cancelled" : "attended"}`}>{record.calculatedTotal.toFixed(2)}/100</em>
        </summary>
        <div className="committee-record-form">
          <div className="committee-record-score-grid">
            {committeeScoreCriteria.map((criterion) => <label key={criterion.id}>
              <span>{criterion.id}<small>เต็ม {criterion.max}</small></span>
              <input type="number" min={0} max={criterion.max} step="0.5" value={scoreInputValue(record.itemScores[criterion.id])} onChange={(event) => patchScore(record.id, criterion.id, event.target.value)}/>
            </label>)}
          </div>
          <div className="committee-record-meta-grid">
            <label>สรุปคะแนนที่กรอกในใบ<input type="number" min={0} max={100} step="0.5" value={scoreInputValue(record.declaredTotal)} onChange={(event) => patchRecord(record.id, { declaredTotal: nullableNumber(event.target.value) })}/></label>
            <label>ผลรวมระบบ<input readOnly value={calculatedRecordTotal(record).toFixed(2)}/></label>
            <label>ผลต่าง<input readOnly value={record.declaredTotal === null ? "-" : (calculatedRecordTotal(record) - record.declaredTotal).toFixed(2)}/></label>
          </div>
          <label>หมายเหตุผู้พิจารณา<textarea rows={3} value={record.note ?? ""} onChange={(event) => patchRecord(record.id, { note: event.target.value })}/></label>
          <div className="committee-record-actions">
            <button className="primary" type="button" onClick={() => saveRecord(record)}><Save/>บันทึกการแก้ไข</button>
            <button className="danger-btn" type="button" onClick={() => deleteRecord(record)}><Trash2/>ลบคะแนนรายการนี้</button>
          </div>
        </div>
      </details>) : <div className="participant-empty">ยังไม่มีคะแนน OCR ที่บันทึกไว้</div>}
    </div>
  </section>;
}

function PreviewCard({
  page,
  index,
  submissions,
  updatePage,
  updateScore,
}: {
  page: PreviewPage;
  index: number;
  submissions: OcrSubmissionOption[];
  updatePage: (id: string, patch: Partial<PreviewPage>) => void;
  updateScore: (pageId: string, scoreId: string, value: string) => void;
}) {
  const calculated = committeeScoreCriteria.reduce((sum, criterion) => sum + (nullableNumber(page.scores[criterion.id]) ?? 0), 0);
  const declared = nullableNumber(page.declaredTotal);
  const mismatch = declared === null ? null : Math.round((calculated - declared) * 100) / 100;
  const isMismatch = mismatch !== null && Math.abs(mismatch) > 0.01;

  return <section className="admin-panel committee-ocr-preview">
    <header className="admin-section-head">
      <FileUp/>
      <div>
        <h2>Preview OCR หน้า {index + 1}</h2>
        <p>{page.fileName} • แผ่นที่ {page.sourcePage.toLocaleString("th-TH")} • {page.status === "ocr" ? "กำลังอ่านคะแนน" : page.message || "พร้อมตรวจทาน"}</p>
      </div>
      <span className={`status-pill ${isMismatch ? "cancelled" : "attended"}`}>{isMismatch ? <XCircle/> : <CheckCircle2/>}{isMismatch ? `ผลรวมคลาด ${mismatch}` : "ผลรวมตรง"}</span>
    </header>
    <div className="committee-ocr-preview-grid">
      <div className="committee-ocr-image"><img src={page.imageUrl} alt={`preview ${page.fileName} page ${page.sourcePage}`}/></div>
      <div className="committee-ocr-fields">
        <label>นวัตกรรม
          <select value={page.submissionCode} onChange={(event) => updatePage(page.id, { submissionCode: event.target.value })}>
            <option value="">เลือกนวัตกรรม</option>
            {submissions.map((submission) => <option key={submission.code} value={submission.code}>{submission.order}. {submission.code} • {submission.title}</option>)}
          </select>
        </label>
        <div className="committee-ocr-score-table">
          {groupLabels.map(([groupId, label]) => <div className="committee-ocr-group" key={groupId}>
            <b>{label}</b>
            {committeeScoreCriteria.filter((criterion) => criterion.groupId === groupId).map((criterion) => <label key={criterion.id}>
              <span>{criterion.id} {criterion.label}<small>เต็ม {criterion.max}</small></span>
              <input type="number" min={0} max={criterion.max} step="0.5" value={page.scores[criterion.id] ?? ""} onChange={(event) => updateScore(page.id, criterion.id, event.target.value)}/>
            </label>)}
          </div>)}
        </div>
        <div className="committee-ocr-total-row">
          <label>ผลรวมจากข้อ 1.1-5.4<input value={calculated.toFixed(2)} readOnly/></label>
          <label>สรุปคะแนนที่ OCR ได้<input type="number" min={0} max={100} step="0.5" value={page.declaredTotal} onChange={(event) => updatePage(page.id, { declaredTotal: event.target.value })}/></label>
        </div>
        <label>หมายเหตุผู้พิจารณา<textarea rows={3} value={page.note} onChange={(event) => updatePage(page.id, { note: event.target.value })}/></label>
      </div>
    </div>
  </section>;
}

async function renderImageFile(file: File) {
  const url = URL.createObjectURL(file);
  try {
    const image = await loadImage(url);
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("ไม่สามารถเตรียมภาพสำหรับ OCR ได้");
    ctx.drawImage(image, 0, 0);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function renderPdfPages(file: File) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.mjs", import.meta.url).toString();
  const document = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const canvases: HTMLCanvasElement[] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = window.document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("ไม่สามารถเตรียม PDF สำหรับ OCR ได้");
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;
    canvases.push(canvas);
  }
  return canvases;
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("เปิดไฟล์ภาพไม่สำเร็จ"));
    image.src = src;
  });
}

async function imageUrlToCanvas(src: string) {
  const image = await loadImage(src);
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("ไม่สามารถเตรียมภาพสำหรับ OCR ได้");
  ctx.drawImage(image, 0, 0);
  return canvas;
}

async function recognizeCrop(worker: Tesseract.Worker, canvas: HTMLCanvasElement, rect: { left: number; top: number; width: number; height: number }) {
  const result = await worker.recognize(canvas, { rectangle: rect });
  return result.data.text ?? "";
}

function scoreCropRectangle(canvas: HTMLCanvasElement, scoreId: string) {
  const pointWidth = 595.28;
  const pointHeight = 841.89;
  const scaleX = canvas.width / pointWidth;
  const scaleY = canvas.height / pointHeight;
  const scoreX = 428;
  const scoreWidth = 143;
  const tableStartY = 150;
  const headerHeight = 24;
  const groupHeight = 18;
  const itemHeight = 18.4;
  let cursorY = tableStartY + headerHeight;
  for (const [, groupLabel] of groupLabels) {
    cursorY += groupHeight;
    const groupItems = committeeScoreCriteria.filter((criterion) => criterion.groupLabel === groupLabel);
    for (const criterion of groupItems) {
      if (criterion.id === scoreId) {
        return {
          left: Math.round((scoreX + 12) * scaleX),
          top: Math.round((cursorY + 2) * scaleY),
          width: Math.round((scoreWidth - 24) * scaleX),
          height: Math.round((itemHeight - 4) * scaleY),
        };
      }
      cursorY += itemHeight;
    }
  }
  return { left: Math.round(scoreX * scaleX), top: Math.round(tableStartY * scaleY), width: Math.round(scoreWidth * scaleX), height: Math.round(22 * scaleY) };
}

function summaryCropRectangle(canvas: HTMLCanvasElement) {
  const scaleX = canvas.width / 595.28;
  const scaleY = canvas.height / 841.89;
  return {
    left: Math.round(42 * scaleX),
    top: Math.round(710 * scaleY),
    width: Math.round(108 * scaleX),
    height: Math.round(34 * scaleY),
  };
}

function scoreFromText(text: string, max: number) {
  const normalized = text.replace(/[Oo]/g, "0").replace(/[^\d.]/g, " ");
  const value = normalized.split(/\s+/).map(Number).find((number) => Number.isFinite(number));
  if (value === undefined) return "";
  return String(Math.min(Math.max(Math.round(value * 2) / 2, 0), max));
}

function nullableNumber(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function scoreInputValue(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "";
}

function calculatedRecordTotal(record: Pick<SavedScoreRecord, "itemScores">) {
  return committeeScoreCriteria.reduce((sum, criterion) => sum + (record.itemScores[criterion.id] ?? 0), 0);
}

function safeTime(value: string | null | undefined) {
  const time = new Date(value ?? "").getTime();
  return Number.isFinite(time) ? time : 0;
}
