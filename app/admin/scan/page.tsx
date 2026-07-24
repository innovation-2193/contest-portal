import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ArrowLeft, QrCode } from "lucide-react";
import { AdminQrScanner } from "../../../components/AdminQrScanner";
import { cookieName, verifyAdminToken } from "../../../lib/admin-auth";

export const dynamic = "force-dynamic";

export default async function AdminScanPage() {
  const cookieStore = await cookies();
  if (!verifyAdminToken(cookieStore.get(cookieName)?.value)) redirect("/admin");

  return <div className="admin-page">
    <div className="wide">
      <div className="admin-topline">
        <div>
          <span className="eyebrow">Admin Check-in</span>
          <h1>เช็คอินหน้างาน</h1>
          <p>สแกน QR Code ค้นหาชื่อผู้เข้าร่วม หรือกรอกรหัส REG เพื่ออัปเดตสถานะเป็นเข้าร่วมงานแล้ว</p>
        </div>
        <Link className="secondary" href="/admin"><ArrowLeft/>กลับหลังบ้าน</Link>
      </div>
      <section className="admin-panel">
        <header><QrCode/><div><h2>ระบบเช็คอินหน้างาน</h2><p>รองรับการสแกนผ่านกล้อง Live Search จากชื่อผู้เข้าร่วม และกรอกรหัสลงทะเบียนด้วยตนเอง</p></div></header>
        <AdminQrScanner />
      </section>
    </div>
  </div>;
}
