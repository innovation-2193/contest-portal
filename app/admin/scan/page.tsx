import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { QrCode } from "lucide-react";
import { AdminQrScanner, type CheckInRoleCounts } from "../../../components/AdminQrScanner";
import { BackButton } from "../../../components/BackButton";
import { cookieName, getAdminSession } from "../../../lib/admin-auth";
import { getParticipantCheckInRoleCounts, getParticipantRegistrationRoleCounts } from "../../../lib/admin-store";

export const dynamic = "force-dynamic";

export default async function AdminScanPage() {
  const cookieStore = await cookies();
  const session = getAdminSession(cookieStore.get(cookieName)?.value);
  if (!session) redirect("/admin");
  const initialRoleCounts = await getParticipantCheckInRoleCounts() as CheckInRoleCounts;
  const registrationRoleCounts = await getParticipantRegistrationRoleCounts() as CheckInRoleCounts;

  return <div className="admin-page">
    <div className="wide">
      <div className="admin-topline">
        <div>
          <span className="eyebrow">Admin Check-in</span>
          <h1>เช็คอินหน้างาน</h1>
          <p>สแกน QR Code หรือค้นหาชื่อผู้เข้าร่วมเพื่ออัปเดตสถานะเป็นเข้าร่วมงานแล้ว</p>
        </div>
        <BackButton />
      </div>
      <section className="admin-panel">
        <header><QrCode/><div><h2>ระบบเช็คอินหน้างาน</h2><p>รองรับการสแกนผ่านกล้องและ Live Search จากข้อมูลผู้เข้าร่วม</p></div></header>
        <AdminQrScanner initialRoleCounts={initialRoleCounts} registrationRoleCounts={registrationRoleCounts} />
      </section>
    </div>
  </div>;
}
