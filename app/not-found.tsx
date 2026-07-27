import Link from "next/link";
import { cookies } from "next/headers";
import { Compass, Home, ShieldAlert } from "lucide-react";
import { NotFoundSearch } from "../components/NotFoundSearch";
import { getActiveSession } from "../lib/active-session";

export default async function NotFound() {
  const activeSession = getActiveSession(await cookies());
  return <section className="not-found-page">
    <div className="not-found-grid" aria-hidden="true"/>
    <div className="wide not-found-wrap">
      <div className="not-found-emblem">
        <img src="/logo-3d.png" alt=""/>
      </div>
      <span className="not-found-code"><ShieldAlert/>404 Page Not Found</span>
      <h1>ไม่พบหน้าที่คุณกำลังค้นหา</h1>
      <p>ลิงก์นี้อาจถูกย้าย เปลี่ยนชื่อ หรือหมดอายุแล้ว ลองค้นหาหน้าที่ต้องการจากช่องด้านล่าง หรือกลับไปยังหน้าแรกของระบบ</p>
      <NotFoundSearch activeSession={activeSession ? { href: activeSession.href, label: activeSession.label } : null}/>
      <div className="not-found-actions">
        <Link className="primary" href="/"><Home/>กลับหน้าแรก</Link>
        <Link className="secondary" href="/#project"><Compass/>ดูข้อมูลโครงการ</Link>
      </div>
    </div>
  </section>;
}
