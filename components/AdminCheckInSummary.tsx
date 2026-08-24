import { CheckCircle2, Clock3, UserCheck, Users } from "lucide-react";
import type { RegistrationRecord } from "../lib/local-registrations";
import { participantRoleClass } from "../lib/participant-role-style";

const roleOrder = ["VIP", "Guest", "Exhibitor", "Competitor", "Staff"] as const;

export function AdminCheckInSummary({ participants }: { participants: RegistrationRecord[] }) {
  const activeParticipants = participants.filter((participant) => participant.status !== "cancelled");
  const checkedIn = activeParticipants.filter((participant) => participant.status === "attended").length;
  const waiting = activeParticipants.length - checkedIn;
  const cancelled = participants.length - activeParticipants.length;
  const attendanceRate = activeParticipants.length ? Math.round((checkedIn / activeParticipants.length) * 100) : 0;
  const roleStats = roleOrder.map((role) => {
    const roleParticipants = activeParticipants.filter((participant) => participant.participant_role === role);
    const roleCheckedIn = roleParticipants.filter((participant) => participant.status === "attended").length;
    return { role, total: roleParticipants.length, checkedIn: roleCheckedIn, waiting: roleParticipants.length - roleCheckedIn };
  });

  return <section className="admin-global-checkin-summary" aria-label="สรุปสถานะเช็คอินผู้เข้าร่วมงาน">
    <div className="admin-global-checkin-heading"><UserCheck/><div><span className="eyebrow">Live Event Check-in</span><h2>สรุปการเข้าร่วมงาน</h2><p>ข้อมูลล่าสุดจากระบบผู้ลงทะเบียน ใช้ตรวจสอบจำนวนผู้มาเช็คอินในทุกหน้าหลังบ้าน</p></div><strong>{attendanceRate.toLocaleString("th-TH")}%<small>เช็คอินแล้ว</small></strong></div>
    <div className="admin-global-checkin-metrics">
      <div><Users/><span>ลงทะเบียนทั้งหมด</span><b>{activeParticipants.length.toLocaleString("th-TH")} คน</b></div>
      <div className="is-checked-in"><CheckCircle2/><span>มาเช็คอินแล้ว</span><b>{checkedIn.toLocaleString("th-TH")} คน</b></div>
      <div className="is-waiting"><Clock3/><span>ยังไม่เช็คอิน</span><b>{waiting.toLocaleString("th-TH")} คน</b></div>
      <div className="is-cancelled"><Users/><span>ยกเลิกการลงทะเบียน</span><b>{cancelled.toLocaleString("th-TH")} คน</b></div>
    </div>
    <div className="admin-global-checkin-roles">
      <div className="admin-global-checkin-roles-heading"><Users/><b>สถานะเช็คอินแยกตาม Role</b><span>ลงทะเบียน / เช็คอินแล้ว / ยังไม่เช็คอิน</span></div>
      <div className="admin-global-checkin-role-grid">{roleStats.map((item) => <article className={`admin-global-role-card ${participantRoleClass(item.role)}`} key={item.role}>
        <header><b>{item.role}</b><span>{item.total.toLocaleString("th-TH")} คน</span></header>
        <div><span>ลงทะเบียน <b>{item.total.toLocaleString("th-TH")}</b></span><span>เช็คอินแล้ว <b>{item.checkedIn.toLocaleString("th-TH")}</b></span><span>รอเช็คอิน <b>{item.waiting.toLocaleString("th-TH")}</b></span></div>
      </article>)}</div>
    </div>
  </section>;
}
