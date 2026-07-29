import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { AlertTriangle, KeyRound, ShieldCheck } from "lucide-react";
import { SecretInput } from "../../../../components/SecretInput";
import {
  adminCookieSecure,
  adminSessionMaxAgeSeconds,
  cookieName,
  createAdminSessionToken,
} from "../../../../lib/admin-auth";
import {
  getAdminAccountByResetToken,
  setAdminPasswordByResetToken,
  validateAdminPasswordStrength,
} from "../../../../lib/admin-users";
import { recordAuditEvent } from "../../../../lib/audit-log";

export const dynamic = "force-dynamic";

export default async function AdminPasswordPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { token } = await params;
  const query = await searchParams;
  const account = await getPasswordResetAccount(token);
  const message = adminPasswordMessage(query.status);

  return <div className="admin-page">
    <div className="wide">
      <section className="admin-login admin-password-panel">
        <span className="eyebrow">Admin Password</span>
        <h1>ตั้งรหัสผ่านแอดมิน</h1>
        {account ? <>
          <p>ตั้งรหัสผ่านสำหรับ {account.email}</p>
          {message && <div className="admin-login-alert"><AlertTriangle/>{message}</div>}
          <form action={setPasswordAction} className="admin-login-card admin-password-card">
            <input type="hidden" name="token" value={token}/>
            <label>รหัสผ่านใหม่<SecretInput name="password" minLength={10} required autoComplete="new-password" aria-describedby="admin-password-help"/></label>
            <label>ยืนยันรหัสผ่าน<SecretInput name="confirmPassword" minLength={10} required autoComplete="new-password" aria-describedby="admin-password-help"/></label>
            <div className="admin-password-guidance" id="admin-password-help">
              <ShieldCheck/>
              <span>ใช้รหัสผ่านอย่างน้อย 10 ตัวอักษร และผสมอย่างน้อย 3 แบบ: ตัวพิมพ์เล็ก ตัวพิมพ์ใหญ่ ตัวเลข หรือสัญลักษณ์ ห้ามใช้คำเดาง่ายหรือมีช่องว่าง</span>
            </div>
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
  const passwordPath = `/admin/password/${encodeURIComponent(token)}`;
  if (password !== confirmPassword) redirect(`${passwordPath}?status=mismatch`);
  const strength = validateAdminPasswordStrength(password);
  if (!strength.ok) redirect(`${passwordPath}?status=weak`);
  let account: Awaited<ReturnType<typeof setAdminPasswordByResetToken>>;
  try {
    account = await setAdminPasswordByResetToken(token, password);
  } catch (error) {
    console.error("admin password set failed", error);
    redirect(`${passwordPath}?status=invalid`);
  }
  const requestHeaders = await headers();
  await recordAuditEvent({
    actor: { type: "admin", email: account.email },
    action: "admin_user.password_set",
    entityType: "admin_user",
    entityId: account.id,
    summary: `Admin ตั้ง/รีเซ็ตรหัสผ่าน ${account.email}`,
  }, requestHeaders);
  const cookieStore = await cookies();
  cookieStore.set(cookieName, createAdminSessionToken({ email: account.email, role: "admin" }), {
    httpOnly: true,
    sameSite: "strict",
    secure: adminCookieSecure(),
    path: "/",
    maxAge: adminSessionMaxAgeSeconds("admin"),
  });
  redirect("/admin");
}

function adminPasswordMessage(status?: string) {
  if (status === "mismatch") return "รหัสผ่านทั้งสองช่องไม่ตรงกัน กรุณาตรวจสอบอีกครั้ง";
  if (status === "weak") return "รหัสผ่านยังง่ายเกินไป กรุณาตั้งใหม่ให้ยาวขึ้นและผสมตัวอักษร ตัวเลข หรือสัญลักษณ์";
  if (status === "invalid") return "ลิงก์ตั้งรหัสผ่านหมดอายุหรือไม่ถูกต้อง กรุณาขอให้ Super Admin ส่งลิงก์ใหม่";
  return "";
}
