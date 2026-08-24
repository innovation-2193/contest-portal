import { CheckCircle2, Clock3, UserCheck, Users } from "lucide-react";
import type { RegistrationRecord } from "../lib/local-registrations";

export function AdminCheckInSummary({ participants }: { participants: RegistrationRecord[] }) {
  const activeParticipants = participants.filter((participant) => participant.status !== "cancelled");
  const checkedIn = activeParticipants.filter((participant) => participant.status === "attended").length;
  const waiting = activeParticipants.length - checkedIn;
  const cancelled = participants.length - activeParticipants.length;
  const attendanceRate = activeParticipants.length ? Math.round((checkedIn / activeParticipants.length) * 100) : 0;

  return <section className="admin-global-checkin-summary" aria-label="สรุปสถานะเช็คอินผู้เข้าร่วมงาน">
    <div className="admin-global-checkin-heading"><UserCheck/><div><span className="eyebrow">Live Event Check-in</span><h2>สรุปการเข้าร่วมงาน</h2><p>ข้อมูลล่าสุดจากระบบผู้ลงทะเบียน ใช้ตรวจสอบจำนวนผู้มาเช็คอินในทุกหน้าหลังบ้าน</p></div><strong>{attendanceRate.toLocaleString("th-TH")}%<small>เช็คอินแล้ว</small></strong></div>
    <div className="admin-global-checkin-metrics">
      <div><Users/><span>ลงทะเบียนทั้งหมด</span><b>{activeParticipants.length.toLocaleString("th-TH")} คน</b></div>
      <div className="is-checked-in"><CheckCircle2/><span>มาเช็คอินแล้ว</span><b>{checkedIn.toLocaleString("th-TH")} คน</b></div>
      <div className="is-waiting"><Clock3/><span>ยังไม่เช็คอิน</span><b>{waiting.toLocaleString("th-TH")} คน</b></div>
      <div className="is-cancelled"><Users/><span>ยกเลิกการลงทะเบียน</span><b>{cancelled.toLocaleString("th-TH")} คน</b></div>
    </div>
  </section>;
}
