import Link from "next/link";
import { ArrowLeft, RefreshCw, Trophy } from "lucide-react";
import { ProgressAutoRefresh } from "../../../components/ProgressAutoRefresh";
import { ProgressScoreboardPanel } from "../../../components/ProgressScoreboard";
import { listSubmissions } from "../../../lib/admin-store";
import { sortScoreboardSubmissions } from "../../../lib/scoreboard-ranking";
import { formatProgressDate } from "../../../lib/progress-review";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ProgressScoreboardPage() {
  const submissions = sortScoreboardSubmissions(await listSubmissions());
  const generatedAt = new Date().toISOString();

  return <div className="admin-page progress1-page progress1-scoreboard-page">
    <ProgressAutoRefresh intervalMs={60000}/>
    <div className="wide">
      <div className="admin-topline progress1-topline">
        <div>
          <span className="eyebrow">Realtime Score Board</span>
          <h1>Score Board คะแนนรอบที่ 1</h1>
          <p>แสดงอันดับผู้สมัครที่ส่งคะแนนแล้วทั้งหมด อัปเดตล่าสุด {formatProgressDate(generatedAt)}</p>
        </div>
        <div className="admin-actions">
          <span className="progress1-live-badge"><RefreshCw/>อัปเดตอัตโนมัติทุก 1 นาที</span>
          <Link className="secondary" href="/progress1"><ArrowLeft/>กลับหน้าสรุป</Link>
        </div>
      </div>

      <div className="progress1-scoreboard-total">
        <Trophy/>
        <div>
          <span>จำนวนรายการที่มีคะแนน</span>
          <b>{submissions.length.toLocaleString("th-TH")}</b>
        </div>
      </div>

      <ProgressScoreboardPanel submissions={submissions} total={submissions.length} mode="full"/>
    </div>
  </div>;
}
