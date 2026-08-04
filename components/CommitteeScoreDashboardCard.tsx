"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Download, Eye, FileScan, Trophy } from "lucide-react";
import { committeeJudges } from "../lib/committee-score-config";

type DashboardRow = {
  rank: number;
  submissionCode: string;
  submissionTitle: string;
  submissionOrder: number;
  ownerName: string;
  judgeScores: Record<string, number | null>;
  judgeCount: number;
  averageScore: number | null;
};

type SummaryResponse = {
  ok: boolean;
  rows: DashboardRow[];
  total: number;
  message?: string;
};

export function CommitteeScoreDashboardCard({ exportHref }: { exportHref: string }) {
  const [data, setData] = useState<SummaryResponse>({ ok: true, rows: [], total: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetch("/api/admin/committee-scores/summary", { cache: "no-store" })
      .then((response) => response.json())
      .then((payload: SummaryResponse) => {
        if (alive) setData(payload.ok ? payload : { ok: false, rows: [], total: 0, message: payload.message });
      })
      .catch((error) => {
        if (alive) setData({ ok: false, rows: [], total: 0, message: error instanceof Error ? error.message : "โหลดข้อมูลไม่สำเร็จ" });
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  return <section className="admin-panel">
    <header className="admin-section-head"><Trophy/><div><h2>Score Board คณะกรรมการรอบที่ 1</h2><p>จัดอันดับจากคะแนนเฉลี่ยของกรรมการ 5 ท่านเท่านั้น ไม่รวมกับคะแนนเจ้าหน้าที่ตรวจเอกสาร</p></div><div className="admin-actions"><a className="primary" href={exportHref} target="_blank" rel="noreferrer"><Download/>Export ผลคะแนน</a><Link className="secondary" href="/admin/ocr-scores"><FileScan/>เปิด OCR คะแนน</Link></div></header>
    <div className="scoreboard-list committee-dashboard-scoreboard">
      {loading ? <div className="participant-empty">กำลังโหลด Score Board คณะกรรมการ...</div> : null}
      {!loading && !data.ok ? <div className="participant-empty">โหลด Score Board คณะกรรมการไม่สำเร็จ: {data.message ?? "กรุณาลองใหม่อีกครั้ง"}</div> : null}
      {!loading && data.ok && data.rows.length ? data.rows.map((row) => <article className="scoreboard-row" key={row.submissionCode}>
        <b>#{row.rank}</b>
        <div><strong>{row.submissionTitle}</strong><small>{row.submissionCode} • ลำดับนวัตกรรม {row.submissionOrder.toLocaleString("th-TH")} • {row.ownerName}</small></div>
        <span>{row.averageScore?.toFixed(2) ?? "-"}/100</span>
        <div className="scoreboard-actions committee-score-mini">
          {committeeJudges.map((judge) => <em key={judge.key} className={`status-pill ${row.judgeScores[judge.key] === null ? "registered" : "attended"}`}>ก.{judge.order}: {row.judgeScores[judge.key] ?? "-"}</em>)}
          <Link className="secondary small-action" href="/admin/ocr-scores"><Eye/>ดูรายละเอียด</Link>
        </div>
      </article>) : null}
      {!loading && data.ok && !data.rows.length ? <div className="participant-empty">ยังไม่มีคะแนนคณะกรรมการจาก OCR</div> : null}
    </div>
    <div className="card-more"><span>ทั้งหมด {data.total.toLocaleString("th-TH")} รายการ</span><Link className="secondary" href="/admin/ocr-scores"><Eye/>ดูทั้งหมด</Link></div>
  </section>;
}
