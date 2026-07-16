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
          <h1>สแกน QR Code เช็คอิน</h1>
          <p>สแกน QR Code ที่ผู้เข้าร่วมงานได้รับจากอีเมลหรือไฟล์ PDF เพื่ออัปเดตสถานะเป็นเข้าร่วมงานแล้ว</p>
        </div>
        <Link className="secondary" href="/admin"><ArrowLeft/>กลับหลังบ้าน</Link>
      </div>
      <section className="admin-panel">
        <header><QrCode/><div><h2>ระบบเช็คอินหน้างาน</h2><p>รองรับการสแกนผ่านกล้อง และกรอกรหัสลงทะเบียนด้วยตนเอง</p></div></header>
        <AdminQrScanner />
      </section>
    </div>
  </div>;
}
