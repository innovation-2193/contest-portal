import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Gift } from "lucide-react";
import { BackButton } from "../../../components/BackButton";
import { GiftQrScanner } from "../../../components/GiftQrScanner";
import { cookieName, getAdminSession } from "../../../lib/admin-auth";

export const dynamic = "force-dynamic";

export default async function GiftScanPage() {
  const session = getAdminSession((await cookies()).get(cookieName)?.value);
  if (!session) redirect("/admin");
  return <div className="admin-page"><div className="wide">
    <div className="admin-topline"><div><span className="eyebrow">Survey Gift Redemption</span><h1>จุดรับของชำร่วย</h1><p>สแกน QR Code ที่แสดงหลังทำแบบประเมินความพึงพอใจ ระบบจะแจ้งเตือนทันทีหากรับของชำร่วยไปแล้ว</p></div><BackButton/></div>
    <section className="admin-panel gift-scan-panel"><header className="admin-section-head"><Gift/><div><h2>สแกน QR Code รับของชำร่วย</h2><p>QR Code นี้แยกจาก QR Code เช็คอินเข้าร่วมงาน</p></div></header><GiftQrScanner/></section>
  </div></div>;
}
