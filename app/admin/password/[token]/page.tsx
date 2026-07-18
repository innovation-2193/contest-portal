import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { KeyRound, ShieldCheck } from "lucide-react";
import {
  adminCookieSecure,
  adminSessionMaxAgeSeconds,
  cookieName,
  createAdminSessionToken,
} from "../../../../lib/admin-auth";
import {
  getAdminAccountByResetToken,
  setAdminPasswordByResetToken,
} from "../../../../lib/admin-users";
import { recordAuditEvent } from "../../../../lib/audit-log";

export const dynamic = "force-dynamic";

export default async function AdminPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const account = await getPasswordResetAccount(token);

  return <div className="admin-page">
    <div className="wide">
      <section className="admin-login admin-password-panel">
        <span className="eyebrow">Admin Password</span>
        <h1>ตั้งรหัสผ่านแอดมิน</h1>
        {account ? <>
          <p>ตั้งรหัสผ่านสำหรับ {account.email}</p>
          <form action={setPasswordAction} className="admin-login-card admin-password-card">
            <input type="hidden" name="token" value={token}/>
            <label>รหัสผ่านใหม่<input type="password" name="password" minLength={8} required autoComplete="new-password"/></label>
            <label>ยืนยันรหัสผ่าน<input type="password" name="confirmPassword" minLength={8} required autoComplete="new-password"/></label>
            <button className="primary" type="submit"><KeyRound/>บันทึกรหัสผ่าน</button>
          </form>
        </> : <div className="admin-login-alert"><ShieldCheck/>ลิงก์ตั้งรหัสผ่านหมดอายุหรือไม่ถูกต้อง กรุณาขอให้ Super Admin ส่งลิงก์ใหม่</div>}
      </section>
    </div>
  </div>;
}

async function getPasswordResetAccount(token: string) {
  try {
    return await getAdminAccountByResetToken(token);
  } catch (error) {
    console.error("admin password reset lookup failed", error);
    return null;
  }
}

async function setPasswordAction(formData: FormData) {
  "use server";
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");
  if (password !== confirmPassword) throw new Error("รหัสผ่านและการยืนยันรหัสผ่านไม่ตรงกัน");
  const account = await setAdminPasswordByResetToken(token, password);
  await recordAuditEvent({
    actor: { type: "admin", email: account.email },
    action: "auth.admin_password_set",
    entityType: "admin_user",
    entityId: account.id,
    summary: `Admin ตั้ง/รีเซ็ตรหัสผ่าน ${account.email}`,
  });
  const cookieStore = await cookies();
  cookieStore.set(cookieName, createAdminSessionToken({ email: account.email, role: "admin" }), {
    httpOnly: true,
    sameSite: "strict",
    secure: adminCookieSecure(),
    path: "/",
    maxAge: adminSessionMaxAgeSeconds(),
  });
  redirect("/admin");
}
