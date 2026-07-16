import { createHmac, timingSafeEqual } from "crypto";

const cookieName = "contest_admin";

export { cookieName };

export function adminPassword() {
  return process.env.ADMIN_PASSWORD ?? "";
}

export function adminToken() {
  const password = adminPassword();
  if (!password) return "";
  return createHmac("sha256", process.env.ADMIN_SESSION_SECRET ?? password)
    .update(password)
    .digest("hex");
}

export function verifyAdminToken(value?: string) {
  const expected = adminToken();
  if (!value || !expected || value.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(value), Buffer.from(expected));
}
