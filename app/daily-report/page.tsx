import Link from "next/link";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  Building2,
  CheckCircle2,
  ClipboardList,
  Eye,
  FileText,
  LineChart,
  Trophy,
  UserCheck,
  Users,
} from "lucide-react";
import { AdminPrintButton } from "../../components/AdminPrintButton";
import {
  listParticipants,
  listSubmissions,
  type SubmissionListItem,
} from "../../lib/admin-store";
import type { RegistrationRecord } from "../../lib/local-registrations";
import { getSiteStats, type SiteStats } from "../../lib/site-analytics";

export const dynamic = "force-dynamic";

type OrgSection =
  | "สำนักงานผู้บัญชาการตำรวจแห่งชาติ"
  | "ส่วนป้องกันและปราบปรามอาชญากรรม"
  | "ส่วนสนับสนุนส่วนป้องกันและปราบปรามอาชญากรรม"
  | "ส่วนการศึกษา"
  | "ส่วนบริการ"
  | "อื่น ๆ";

type OrganizationUnit = {
  label: string;
  section: OrgSection;
  aliases: string[];
};

type OrgStat = OrganizationUnit & {
  registrations: number;
  submissions: number;
  percent: number;
  unmatched?: boolean;
};

type OrgSectionSummary = {
  section: OrgSection;
  registrations: number;
  submissions: number;
  activeUnits: number;
  totalUnits: number;
  percent: number;
  topUnit: OrgStat | null;
};

const orgSections: OrgSection[] = [
  "สำนักงานผู้บัญชาการตำรวจแห่งชาติ",
  "ส่วนป้องกันและปราบปรามอาชญากรรม",
  "ส่วนสนับสนุนส่วนป้องกันและปราบปรามอาชญากรรม",
  "ส่วนการศึกษา",
  "ส่วนบริการ",
  "อื่น ๆ",
];

const organizationUnits: OrganizationUnit[] = [
  unit("สำนักงานส่งกำลังบำรุง", "สำนักงานผู้บัญชาการตำรวจแห่งชาติ", ["สกบ.", "สกบ"]),
  unit("สำนักงานยุทธศาสตร์ตำรวจ", "สำนักงานผู้บัญชาการตำรวจแห่งชาติ", ["สยศ.ตร.", "สยศ"]),
  unit("สำนักงานงบประมาณและการเงิน", "สำนักงานผู้บัญชาการตำรวจแห่งชาติ", ["สงป.", "สงป"]),
  unit("สำนักงานกำลังพล", "สำนักงานผู้บัญชาการตำรวจแห่งชาติ", ["สกพ.", "สกพ"]),
  unit("สำนักงานกฎหมายและคดี", "สำนักงานผู้บัญชาการตำรวจแห่งชาติ", ["กมค.", "กมค"]),
  unit("สำนักงานจเรตำรวจ", "สำนักงานผู้บัญชาการตำรวจแห่งชาติ", ["จต.", "จเรตำรวจ"]),
  unit("สำนักงานตรวจสอบภายใน", "สำนักงานผู้บัญชาการตำรวจแห่งชาติ", ["สตส.", "ตรวจสอบภายใน"]),
  unit("สำนักงานคณะกรรมการข้าราชการตำรวจ", "สำนักงานผู้บัญชาการตำรวจแห่งชาติ", ["ก.ตร.", "กตร"]),
  unit("สำนักงานเลขานุการตำรวจแห่งชาติ", "สำนักงานผู้บัญชาการตำรวจแห่งชาติ", ["สลก.ตร.", "สลก"]),
  unit("สำนักงานคณะกรรมการนโยบายตำรวจแห่งชาติ", "สำนักงานผู้บัญชาการตำรวจแห่งชาติ", ["ก.ต.ช.", "กตช"]),
  unit("กองวินัย", "สำนักงานผู้บัญชาการตำรวจแห่งชาติ", ["วินัย"]),
  unit("กองสารนิเทศ", "สำนักงานผู้บัญชาการตำรวจแห่งชาติ", ["สารนิเทศ"]),
  unit("กองบินตำรวจ", "สำนักงานผู้บัญชาการตำรวจแห่งชาติ", ["บินตำรวจ"]),
  unit("กองต่างประเทศ", "สำนักงานผู้บัญชาการตำรวจแห่งชาติ", ["ต่างประเทศ"]),
  unit("สถาบันฝึกอบรมระหว่างประเทศว่าด้วยการดำเนินการให้เป็นไปตามกฎหมาย", "สำนักงานผู้บัญชาการตำรวจแห่งชาติ", ["ileta", "สถาบันฝึกอบรมระหว่างประเทศ"]),
  unit("กองบัญชาการตำรวจนครบาล", "ส่วนป้องกันและปราบปรามอาชญากรรม", ["บช.น.", "บชน", "กองบัญชาการตำรวจนครบาล"]),
  ...rangeUnits("กองบังคับการตำรวจนครบาล", "ส่วนป้องกันและปราบปรามอาชญากรรม", (n) => [`บก.น.${n}`, `บกน${n}`, `บก น ${n}`, `นครบาล ${n}`, `ตำรวจนครบาล ${n}`]),
  ...rangeUnits("ตำรวจภูธร ภาค", "ส่วนป้องกันและปราบปรามอาชญากรรม", (n) => [`ภ.${n}`, `ภาค ${n}`, `ตำรวจภูธรภาค ${n}`, `ตำรวจภูธร ภาค ${n}`]),
  unit("ตำรวจภูธรจังหวัด", "ส่วนป้องกันและปราบปรามอาชญากรรม", ["ภ.จว.", "ภจว", "ตำรวจภูธรจังหวัด"]),
  unit("กองบัญชาการตำรวจปราบปรามยาเสพติด", "ส่วนสนับสนุนส่วนป้องกันและปราบปรามอาชญากรรม", ["บช.ปส.", "บชปส", "ปราบปรามยาเสพติด"]),
  unit("กองบัญชาการตำรวจสอบสวนกลาง", "ส่วนสนับสนุนส่วนป้องกันและปราบปรามอาชญากรรม", ["บช.ก.", "บชก", "สอบสวนกลาง"]),
  unit("กองบัญชาการตำรวจสันติบาล", "ส่วนสนับสนุนส่วนป้องกันและปราบปรามอาชญากรรม", ["บช.ส.", "บชส", "สันติบาล"]),
  unit("สำนักงานตรวจคนเข้าเมือง", "ส่วนสนับสนุนส่วนป้องกันและปราบปรามอาชญากรรม", ["สตม.", "สตม", "ตรวจคนเข้าเมือง"]),
  unit("สำนักงานพิสูจน์หลักฐานตำรวจ", "ส่วนสนับสนุนส่วนป้องกันและปราบปรามอาชญากรรม", ["สพฐ.ตร.", "สพฐ", "พิสูจน์หลักฐาน"]),
  unit("กองบัญชาการตำรวจตระเวนชายแดน", "ส่วนสนับสนุนส่วนป้องกันและปราบปรามอาชญากรรม", ["บช.ตชด.", "ตชด", "ตระเวนชายแดน"]),
  unit("สำนักงานเทคโนโลยีสารสนเทศและการสื่อสาร", "ส่วนสนับสนุนส่วนป้องกันและปราบปรามอาชญากรรม", ["สทส.", "สทส", "เทคโนโลยีสารสนเทศ"]),
  unit("กองบัญชาการตำรวจท่องเที่ยว", "ส่วนสนับสนุนส่วนป้องกันและปราบปรามอาชญากรรม", ["บช.ทท.", "บชทท", "ตำรวจท่องเที่ยว"]),
  unit("กองบัญชาการตำรวจสืบสวนสอบสวนอาชญากรรมทางเทคโนโลยี", "ส่วนสนับสนุนส่วนป้องกันและปราบปรามอาชญากรรม", ["บช.สอท.", "บชสอท", "อาชญากรรมทางเทคโนโลยี", "ไซเบอร์"]),
  unit("กองบัญชาการศึกษา", "ส่วนการศึกษา", ["บช.ศ.", "บชศ", "กองบัญชาการศึกษา"]),
  unit("โรงเรียนนายร้อยตำรวจ", "ส่วนการศึกษา", ["รร.นรต.", "รรนรต", "นายร้อยตำรวจ"]),
  unit("โรงพยาบาลตำรวจ", "ส่วนบริการ", ["รพ.ตร.", "รพตร", "โรงพยาบาลตำรวจ"]),
];

export default async function DailyReportPage() {
  const [participants, submissions, siteStats] = await Promise.all([
    listParticipants(),
    listSubmissions(),
    getSiteStats(),
  ]);

  const activeParticipants = participants.filter((item) => item.status !== "cancelled");
  const todayKey = bangkokDayKey(new Date());
  const registeredToday = activeParticipants.filter((item) => bangkokDayKey(item.registered_at) === todayKey);
  const submittedToday = submissions.filter((item) => bangkokDayKey(item.submitted_at) === todayKey);
  const attended = activeParticipants.filter((item) => item.status === "attended");
  const teams = submissions.filter((item) => item.submission_type === "team");
  const scored = submissions.filter((item) => item.review_total_score !== null && item.review_total_score !== undefined);
  const orgStats = buildOrgStats(activeParticipants, submissions);
  const orgSectionSummaries = buildOrgSectionSummaries(orgStats);
  const orgsWithSubmissions = orgStats.filter((item) => item.submissions > 0).length;
  const topOrgStats = [...orgStats]
    .filter((item) => item.submissions > 0)
    .sort((a, b) => b.submissions - a.submissions || b.registrations - a.registrations || a.label.localeCompare(b.label, "th"))
    .slice(0, 8);
  const statusStats = buildStatusStats(submissions);

  return <div className="admin-page report-page">
    <div className="wide">
      <div className="report-confidential-alert">
        <AlertTriangle/>
        <div>
          <b>ใช้ภายใน ห้ามเผยแพร่</b>
          <span>ข้อมูลในหน้านี้เป็นรายงานสำหรับผู้บังคับบัญชาเท่านั้น กรุณาไม่ส่งต่อหรือเผยแพร่ภายนอกหน่วยงาน</span>
        </div>
      </div>

      <div className="admin-topline report-topline">
        <div>
          <span className="eyebrow">Daily Report</span>
          <h1>รายงานสรุปประจำวัน</h1>
          <p>{formatFullThaiDate(new Date())} • หน้าสรุปสำหรับผู้บังคับบัญชา</p>
        </div>
        <div className="admin-actions">
          <AdminPrintButton label="พิมพ์ / บันทึก PDF"/>
          <Link className="secondary" href="/admin"><ArrowLeft/>กลับหลังบ้าน</Link>
        </div>
      </div>

      <section className="report-hero-panel">
        <div>
          <span className="eyebrow">ภาพรวมวันนี้</span>
          <h2>ลงทะเบียนแล้ว {activeParticipants.length.toLocaleString("th-TH")} คน ส่งผลงานแล้ว {submissions.length.toLocaleString("th-TH")} รายการ</h2>
          <p>สรุปยอดประจำวัน ยอดเข้าชมเว็บไซต์ และกราฟแยกตามสังกัดในผังองค์กร สตช. โดยหน่วยที่ระบุ 1-9 แยกเป็นรายหน่วย</p>
        </div>
        <div className="report-pulse">
          <Eye/>
          <b>{siteStats.today.toLocaleString("th-TH")}</b>
          <span>ยอดเข้าชมวันนี้</span>
        </div>
      </section>

      <section className="report-metric-grid" aria-label="summary">
        <Metric icon={<Eye/>} value={siteStats.today} label="ยอดเข้าชมวันนี้" detail={`เมื่อวาน ${siteStats.yesterday.toLocaleString("th-TH")} ครั้ง`}/>
        <Metric icon={<LineChart/>} value={siteStats.total} label="ยอดเข้าชมสะสม" detail={`เฉลี่ย 7 วัน ${siteStats.average7Days.toLocaleString("th-TH")} ครั้ง/วัน`}/>
        <Metric icon={<Users/>} value={activeParticipants.length} label="คนสมัคร / ลงทะเบียนทั้งหมด" detail={`วันนี้ +${registeredToday.length.toLocaleString("th-TH")} คน`}/>
        <Metric icon={<UserCheck/>} value={attended.length} label="เช็คอินแล้ว" detail={`รอเช็คอิน ${(activeParticipants.length - attended.length).toLocaleString("th-TH")} คน`}/>
        <Metric icon={<FileText/>} value={submissions.length} label="ผลงานที่ส่งแล้ว" detail={`วันนี้ +${submittedToday.length.toLocaleString("th-TH")} รายการ`}/>
        <Metric icon={<Building2/>} value={orgsWithSubmissions} label="สังกัดที่มีผลงาน" detail={`จาก ${organizationUnits.length.toLocaleString("th-TH")} หน่วยตามผัง`}/>
        <Metric icon={<Trophy/>} value={scored.length} label="ผลงานที่มีคะแนนแล้ว" detail={`ยังรอตรวจ ${(submissions.length - scored.length).toLocaleString("th-TH")} รายการ`}/>
        <Metric icon={<ClipboardList/>} value={teams.length} label="ส่งแบบทีม" detail={`ส่งเดี่ยว ${(submissions.length - teams.length).toLocaleString("th-TH")} รายการ`}/>
      </section>

      <section className="report-grid">
        <article className="admin-panel report-panel">
          <header><LineChart/><div><h2>ยอดเข้าชมเว็บไซต์ 7 วันล่าสุด</h2><p>นับผู้เข้าชมหน้าบ้านแบบวันละหนึ่งครั้งต่ออุปกรณ์ ไม่รวมหน้า /admin</p></div></header>
          <VisitTrend stats={siteStats}/>
        </article>

        <article className="admin-panel report-panel">
          <header><BarChart3/><div><h2>สังกัดที่ส่งผลงานมากที่สุด</h2><p>จัดอันดับจากจำนวนผลงานที่ส่งเข้าระบบ</p></div></header>
          <div className="report-rank-list">
            {topOrgStats.length ? topOrgStats.map((item, index) => <div className="report-rank-row" key={item.label}>
              <b>{(index + 1).toLocaleString("th-TH")}</b>
              <span>{item.label}</span>
              <strong>{item.submissions.toLocaleString("th-TH")}</strong>
            </div>) : <p className="report-empty">ยังไม่มีผลงานที่ส่งเข้าระบบ</p>}
          </div>
        </article>

        <article className="admin-panel report-panel">
          <header><CheckCircle2/><div><h2>สถานะผลงาน</h2><p>นับตามสถานะล่าสุดในระบบรับสมัคร</p></div></header>
          <div className="report-status-list">
            {statusStats.map((item) => <div key={item.label}>
              <span>{item.label}</span>
              <b>{item.count.toLocaleString("th-TH")}</b>
              <i><span style={{ width: `${item.percent}%` }}/></i>
            </div>)}
          </div>
        </article>
      </section>

      <section className="admin-panel report-panel">
        <header className="admin-section-head">
          <BarChart3/>
          <div><h2>กราฟผลงานแยกตามสังกัดในผังองค์กร</h2><p>สรุปตามกลุ่มใหญ่ก่อน แล้วแสดงรายละเอียดรายหน่วยด้านล่าง ตัวเลขคือผลงาน / ผู้ลงทะเบียน</p></div>
        </header>
        <div className="report-org-overview">
          {orgSectionSummaries.map((summary) => <OrgSectionOverview key={summary.section} summary={summary}/>)}
        </div>
        <div className="report-org-chart report-org-chart-v2">
          {orgSections.map((section) => {
            const rows = orgStats.filter((item) => item.section === section);
            if (!rows.length) return null;
            const summary = orgSectionSummaries.find((item) => item.section === section);
            return <OrgSectionBlock key={section} section={section} rows={rows} summary={summary}/>;
          })}
        </div>
      </section>

      <section className="admin-panel report-panel">
        <header className="admin-section-head">
          <FileText/>
          <div><h2>ผลงานที่ส่งมาแล้ว</h2><p>รายการล่าสุดทั้งหมดที่ดึงจากระบบรับสมัคร</p></div>
        </header>
        <div className="submission-report-list">
          {submissions.length ? submissions.map((item) => <SubmissionReportItem key={item.submission_code} item={item}/>) : <p className="report-empty">ยังไม่มีผลงานที่ส่งเข้าระบบ</p>}
        </div>
      </section>
    </div>
  </div>;
}

function OrgSectionOverview({ summary }: { summary: OrgSectionSummary }) {
  const activeLabel = `${summary.activeUnits.toLocaleString("th-TH")}/${summary.totalUnits.toLocaleString("th-TH")} หน่วยมีผลงาน`;
  return <article className={summary.submissions > 0 ? "report-org-overview-card" : "report-org-overview-card is-quiet"}>
    <div>
      <span>{summary.section}</span>
      <b>{summary.submissions.toLocaleString("th-TH")}</b>
      <small>ผลงาน • {activeLabel}</small>
    </div>
    <i aria-hidden="true"><span style={{ width: `${summary.submissions > 0 ? Math.max(summary.percent, 6) : 0}%` }}/></i>
    <em>{summary.topUnit ? `มากสุด: ${summary.topUnit.label} (${summary.topUnit.submissions.toLocaleString("th-TH")})` : "ยังไม่มีผลงาน"}</em>
  </article>;
}

function OrgSectionBlock({ section, rows, summary }: { section: OrgSection; rows: OrgStat[]; summary?: OrgSectionSummary }) {
  const sortedRows = [...rows].sort((a, b) => b.submissions - a.submissions || b.registrations - a.registrations || a.label.localeCompare(b.label, "th"));
  return <section className="report-org-section" key={section}>
    <div className="report-org-section-head">
      <div>
        <h3>{section}</h3>
        <span>{summary?.activeUnits.toLocaleString("th-TH") ?? "0"} หน่วยมีผลงาน จาก {summary?.totalUnits.toLocaleString("th-TH") ?? rows.length.toLocaleString("th-TH")} หน่วย</span>
      </div>
      <strong>{(summary?.submissions ?? 0).toLocaleString("th-TH")}<small>ผลงาน</small></strong>
    </div>
    <div className="report-bar-list">
      {sortedRows.map((item) => <OrgBar key={`${section}-${item.label}`} item={item}/>)}
    </div>
  </section>;
}

function Metric({ icon, value, label, detail }: { icon: ReactNode; value: number; label: string; detail: string }) {
  return <article className="report-metric">
    {icon}
    <div>
      <b>{value.toLocaleString("th-TH")}</b>
      <span>{label}</span>
      <small>{detail}</small>
    </div>
  </article>;
}

function VisitTrend({ stats }: { stats: SiteStats }) {
  const max = Math.max(1, ...stats.last7Days.map((item) => item.count));
  return <div className="report-visit-trend">
    <div className="report-visit-summary">
      <span><b>{stats.today.toLocaleString("th-TH")}</b><small>วันนี้</small></span>
      <span><b>{stats.yesterday.toLocaleString("th-TH")}</b><small>เมื่อวาน</small></span>
      <span><b>{stats.peakDay.count.toLocaleString("th-TH")}</b><small>สูงสุด {stats.peakDay.label}</small></span>
    </div>
    <div className="report-visit-bars">
      {stats.last7Days.map((item) => {
        const height = item.count > 0 ? Math.max(10, Math.round((item.count / max) * 100)) : 0;
        return <div key={item.date}>
          <b>{item.count.toLocaleString("th-TH")}</b>
          <i><span style={{ height: `${height}%` }}/></i>
          <small>{item.label}</small>
        </div>;
      })}
    </div>
  </div>;
}

function OrgBar({ item }: { item: OrgStat }) {
  const width = item.submissions > 0 ? Math.max(item.percent, 3) : 0;
  return <div className={`report-bar-row${item.submissions === 0 ? " is-zero" : ""}${item.unmatched ? " is-unmatched" : ""}`}>
    <div className="report-bar-label">
      <span>{item.label}</span>
      <small>{item.unmatched ? "ไม่พบในผังองค์กรที่แนบ" : item.section}</small>
    </div>
    <div className="report-bar-track" aria-hidden="true"><span style={{ width: `${width}%` }}/></div>
    <strong><b>{item.submissions.toLocaleString("th-TH")}</b><small>/ {item.registrations.toLocaleString("th-TH")}</small></strong>
  </div>;
}

function SubmissionReportItem({ item }: { item: SubmissionListItem }) {
  return <article className="submission-report-item">
    <div>
      <b>{item.title_th}</b>
      <small>{item.submission_code} • {formatShortThaiDate(item.submitted_at)}</small>
    </div>
    <span>{item.submission_type === "team" ? `ทีม ${item.team_name || "-"}` : "ส่งเดี่ยว"}</span>
    <p>{item.first_name} {item.last_name}<small>{item.division || "-"} / {item.bureau || "-"}</small></p>
    <em>{statusLabel(item.status)}</em>
  </article>;
}

function buildOrgStats(participants: RegistrationRecord[], submissions: SubmissionListItem[]) {
  const stats = new Map<string, OrgStat>();
  const unmatched = new Map<string, OrgStat>();

  for (const item of organizationUnits) {
    stats.set(item.label, { ...item, registrations: 0, submissions: 0, percent: 0 });
  }

  for (const item of participants) {
    incrementOrgStat(stats, unmatched, item.division, item.bureau, "registrations");
  }
  for (const item of submissions) {
    incrementOrgStat(stats, unmatched, item.division, item.bureau, "submissions");
  }

  const rows = [...stats.values(), ...unmatched.values()].filter((item) => !item.unmatched || item.registrations > 0 || item.submissions > 0);
  const max = Math.max(1, ...rows.map((item) => item.submissions));
  return rows.map((item) => ({ ...item, percent: Math.round((item.submissions / max) * 100) }));
}

function buildOrgSectionSummaries(stats: OrgStat[]): OrgSectionSummary[] {
  const summaries = orgSections.map((section) => {
    const rows = stats.filter((item) => item.section === section);
    const submissions = rows.reduce((sum, item) => sum + item.submissions, 0);
    const registrations = rows.reduce((sum, item) => sum + item.registrations, 0);
    const activeUnits = rows.filter((item) => item.submissions > 0).length;
    const topUnit = [...rows].sort((a, b) => b.submissions - a.submissions || b.registrations - a.registrations)[0] ?? null;
    return {
      section,
      registrations,
      submissions,
      activeUnits,
      totalUnits: rows.length,
      percent: 0,
      topUnit: topUnit && topUnit.submissions > 0 ? topUnit : null,
    };
  });
  const max = Math.max(1, ...summaries.map((item) => item.submissions));
  return summaries.map((item) => ({ ...item, percent: Math.round((item.submissions / max) * 100) }));
}

function incrementOrgStat(
  stats: Map<string, OrgStat>,
  unmatched: Map<string, OrgStat>,
  division: string,
  bureau: string,
  key: "registrations" | "submissions",
) {
  const unitMatch = matchOrganizationUnit(division, bureau);
  if (unitMatch) {
    const current = stats.get(unitMatch.label);
    if (current) current[key] += 1;
    return;
  }

  const label = [division, bureau].map((item) => item.trim()).filter(Boolean).join(" / ") || "ไม่ระบุสังกัด";
  const normalized = normalizeText(label);
  const current = unmatched.get(normalized) ?? {
    label,
    section: "อื่น ๆ",
    aliases: [],
    registrations: 0,
    submissions: 0,
    percent: 0,
    unmatched: true,
  };
  current[key] += 1;
  unmatched.set(normalized, current);
}

function matchOrganizationUnit(division: string, bureau: string) {
  return matchOrganizationText(division) ?? matchOrganizationText(bureau) ?? matchOrganizationText(`${division} ${bureau}`);
}

function matchOrganizationText(value: string) {
  const text = normalizeText(value);
  if (!text) return null;
  return organizationUnits.find((item) => item.aliases.some((alias) => {
    const normalizedAlias = normalizeText(alias);
    return text === normalizedAlias || text.includes(normalizedAlias);
  })) ?? null;
}

function buildStatusStats(submissions: SubmissionListItem[]) {
  const counts = new Map<string, number>();
  for (const item of submissions) counts.set(statusLabel(item.status), (counts.get(statusLabel(item.status)) ?? 0) + 1);
  if (!counts.size) counts.set("ยังไม่มีข้อมูล", 0);
  const max = Math.max(1, ...counts.values());
  return [...counts.entries()].map(([label, count]) => ({
    label,
    count,
    percent: Math.round((count / max) * 100),
  }));
}

function rangeUnits(prefix: string, section: OrgSection, aliases: (n: number) => string[]) {
  return Array.from({ length: 9 }, (_, index) => {
    const n = index + 1;
    return unit(`${prefix} ${n}`, section, aliases(n));
  });
}

function unit(label: string, section: OrgSection, aliases: string[] = []): OrganizationUnit {
  return { label, section, aliases: [label, ...aliases] };
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/[.\s\-_/()]/g, "").replace(/สำนักงานตำรวจแห่งชาติ/g, "ตร");
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    draft: "ฉบับร่าง",
    submitted: "ส่งแล้ว",
    screening: "กำลังตรวจ",
    qualified: "ผ่านเกณฑ์",
    rejected: "ไม่ผ่านเกณฑ์",
  };
  return labels[status] ?? (status || "-");
}

function bangkokDayKey(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function formatFullThaiDate(value: Date) {
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(value);
}

function formatShortThaiDate(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("th-TH", {
    day: "numeric",
    month: "short",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Bangkok",
  }).format(date);
}
