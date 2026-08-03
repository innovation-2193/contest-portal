import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { cookieName, getAdminSession, type AdminSession } from "./admin-auth";

export async function requireSuperAdminPage(): Promise<AdminSession> {
  const cookieStore = await cookies();
  const session = getAdminSession(cookieStore.get(cookieName)?.value);
  if (!session || session.role !== "super_admin") redirect("/admin");
  return session;
}

export function requireSuperAdminRequest(request: Request): AdminSession | null {
  const session = getAdminSession(cookieValue(request.headers.get("cookie"), cookieName));
  return session?.role === "super_admin" ? session : null;
}

export function redirectToAdmin(request: Request) {
  return NextResponse.redirect(new URL("/admin", request.url), 303);
}

function cookieValue(header: string | null, name: string) {
  if (!header) return undefined;
  for (const pair of header.split(";")) {
    const [rawKey, ...rawValue] = pair.trim().split("=");
    if (rawKey === name) return decodeURIComponent(rawValue.join("="));
  }
  return undefined;
}
