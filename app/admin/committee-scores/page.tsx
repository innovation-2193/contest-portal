import Link from "next/link";
import { headers } from "next/headers";
import { ArrowLeft } from "lucide-react";
import { CommitteeScoreDashboardCard } from "../../../components/CommitteeScoreDashboardCard";
import { CommitteeScoreEntryClient, type ScoreSubmissionOption } from "../../../components/CommitteeScoreEntryClient";
import { requireSuperAdminPage } from "../../../lib/admin-guard";
import { listSubmissions } from "../../../lib/admin-store";

export const dynamic = "force-dynamic";

export default async function AdminCommitteeScoresPage() {
  const session = await requireSuperAdminPage();
  const requestHeaders = await headers();
  const exportHref = localSafeAdminHref(requestHeaders, "/api/admin/committee-scores/export");
  const submissions = await loadScoreSubmissions();

  return <div className="admin-page">
    <div className="wide">
      <div className="admin-topline">
        <div>
          <span className="eyebrow">Committee Total Scores</span>
          <h1>กรอกคะแนนรวม</h1>
          <p>กรอกคะแนนรวมของกรรมการ 5 ท่านต่อผลงาน แล้วจัดอันดับคะแนนเฉลี่ยของคณะกรรมการรอบที่ 1</p>
          <small className="admin-role-badge">Super Admin • {session.email}</small>
        </div>
        <div className="admin-actions">
          <Link className="secondary" href="/admin"><ArrowLeft/>กลับหลังบ้าน</Link>
        </div>
      </div>

      <CommitteeScoreDashboardCard exportHref={exportHref}/>
      <CommitteeScoreEntryClient submissions={submissions}/>
    </div>
  </div>;
}

async function loadScoreSubmissions(): Promise<ScoreSubmissionOption[]> {
  try {
    return (await listSubmissions())
      .slice()
      .sort((a, b) => a.submitted_at.localeCompare(b.submitted_at))
      .map((submission, index) => ({
        code: submission.submission_code,
        title: submission.title_th,
        order: index + 1,
        ownerName: `${submission.first_name} ${submission.last_name}`.trim(),
        division: submission.division || submission.bureau || "",
      }));
  } catch (error) {
    console.error("committee score page submissions preload failed", error);
    return [];
  }
}

function localSafeAdminHref(requestHeaders: Headers, pathname: string) {
  const host = requestHeaders.get("host") ?? "";
  const cleanPath = pathname.startsWith("/") ? pathname : `/${pathname}`;
  if (!host.startsWith("0.0.0.0")) return cleanPath;
  const parts = host.split(":");
  const port = host.includes(":") ? `:${parts[parts.length - 1]}` : "";
  return `http://localhost${port}${cleanPath}`;
}
