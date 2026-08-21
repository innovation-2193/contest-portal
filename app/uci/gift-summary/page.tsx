import Link from "next/link";
import { CheckCircle2, Clock3, Filter, Gift, Search, Users } from "lucide-react";
import { BackButton } from "../../../components/BackButton";
import { cookieName, getAdminSession } from "../../../lib/admin-auth";
import { listEvaluationRespondents } from "../../../lib/evaluation-store";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type GiftStatus = "all" | "claimed" | "unclaimed";

export default async function UciGiftSummaryPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const session = getAdminSession((await cookies()).get(cookieName)?.value);
  if (!session) redirect("/uci");

  const params = await searchParams;
  const query = (params.q ?? "").trim();
  const status = normalizeStatus(params.status);
  const respondents = await listEvaluationRespondents();
  const claimedCount = respondents.filter((item) => item.giftClaimedAt).length;
  const unclaimedCount = respondents.length - claimedCount;
  const normalizedQuery = query.toLocaleLowerCase("th-TH");
  const filtered = respondents.filter((item) => {
    const matchesStatus = status === "all" || (status === "claimed" ? Boolean(item.giftClaimedAt) : !item.giftClaimedAt);
    const searchText = `${item.name} ${item.registrationCode} ${item.email}`.toLocaleLowerCase("th-TH");
    return matchesStatus && (!normalizedQuery || searchText.includes(normalizedQuery));
  });

  return <div className="admin-page"><div className="wide">
    <div className="admin-topline">
      <div><span className="eyebrow">SURVEY GIFT SUMMARY</span><h1>สรุปการรับของชำร่วย</h1><p>ตรวจสอบผู้ทำแบบประเมินว่าได้รับของชำร่วยแล้วหรือยังไม่ได้รับ พร้อมค้นหาและกรองรายการ</p><small className="admin-role-badge"><Users/>{session.role === "uci" ? "UCI" : session.role === "super_admin" ? "Super Admin" : "Admin"} • {session.email}</small></div>
      <BackButton />
    </div>

    <section className="admin-panel gift-summary-panel">
      <header className="admin-section-head"><Gift/><div><h2>ภาพรวมสถานะของชำร่วย</h2><p>นับจากผู้ที่ส่งแบบประเมินความพึงพอใจแล้วทั้งหมด</p></div><div className="admin-actions"><Link className="primary" href="/admin/gift-scan"><Gift/>เปิดจุดรับของชำร่วย</Link></div></header>
      <div className="evaluation-dashboard-summary">
        <div className="stat-panel"><Users/><b>{respondents.length.toLocaleString("th-TH")}</b><span>ผู้ทำแบบประเมิน</span></div>
        <div className="stat-panel gift-summary-claimed"><CheckCircle2/><b>{claimedCount.toLocaleString("th-TH")}</b><span>ได้รับของชำร่วยแล้ว</span></div>
        <div className="stat-panel gift-summary-unclaimed"><Clock3/><b>{unclaimedCount.toLocaleString("th-TH")}</b><span>ยังไม่ได้รับ</span></div>
      </div>
    </section>

    <section className="admin-panel gift-summary-panel">
      <form className="audit-filter-form gift-summary-filter" method="get">
        <label>สถานะการรับของชำร่วย
          <select name="status" defaultValue={status}>
            <option value="all">ทั้งหมด</option>
            <option value="claimed">ได้รับแล้ว</option>
            <option value="unclaimed">ยังไม่ได้รับ</option>
          </select>
        </label>
        <label className="audit-filter-search">ค้นหา
          <div><Search/><input name="q" defaultValue={query} placeholder="ชื่อ รหัสลงทะเบียน หรืออีเมล"/></div>
        </label>
        <div className="audit-filter-actions"><button className="primary" type="submit"><Filter/>กรองรายการ</button><Link className="secondary" href="/uci/gift-summary">ล้างตัวกรอง</Link></div>
        <p><Gift/>แสดง {filtered.length.toLocaleString("th-TH")} รายการ จากทั้งหมด {respondents.length.toLocaleString("th-TH")} รายการ</p>
      </form>

      <div className="admin-table-wrap">
        <table className="admin-table compact-admin-table gift-summary-table">
          <thead><tr><th>ผู้ทำแบบประเมิน</th><th>รหัสลงทะเบียน</th><th>อีเมล</th><th>วันที่ทำแบบประเมิน</th><th>สถานะของชำร่วย</th><th>รายละเอียดการรับ</th></tr></thead>
          <tbody>
            {filtered.length ? filtered.map((item) => <tr key={item.registrationCode}>
              <td data-label="ผู้ทำแบบประเมิน"><b>{item.name}</b></td>
              <td data-label="รหัสลงทะเบียน"><b>{item.registrationCode}</b></td>
              <td data-label="อีเมล">{item.email}</td>
              <td data-label="วันที่ทำแบบประเมิน">{formatDate(item.submittedAt)}</td>
              <td data-label="สถานะของชำร่วย"><span className={`status-pill ${item.giftClaimedAt ? "attended" : "registered"}`}>{item.giftClaimedAt ? <><CheckCircle2/>ได้รับแล้ว</> : <><Clock3/>ยังไม่ได้รับ</>}</span></td>
              <td data-label="รายละเอียดการรับ">{item.giftClaimedAt ? <><b>{formatDate(item.giftClaimedAt)}</b><small>โดย {item.giftClaimedByEmail || "ไม่ระบุ"}</small></> : <span className="gift-summary-muted">รอสแกนรับของชำร่วย</span>}</td>
            </tr>) : <tr><td colSpan={6} className="participant-empty">ไม่พบรายการตามตัวกรอง</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  </div></div>;
}

function normalizeStatus(value?: string): GiftStatus {
  return value === "claimed" || value === "unclaimed" ? value : "all";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(new Date(value));
}
