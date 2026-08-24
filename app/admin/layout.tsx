import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { AdminCheckInSummary } from "../../components/AdminCheckInSummary";
import { cookieName, getAdminSession } from "../../lib/admin-auth";
import { listParticipants } from "../../lib/admin-store";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies();
  const session = getAdminSession(cookieStore.get(cookieName)?.value);
  if (!session) return children;

  let participants: Awaited<ReturnType<typeof listParticipants>>;
  try {
    participants = await listParticipants();
  } catch (error) {
    console.error("admin check-in summary failed", error);
    return children;
  }
  return <>
    <div className="admin-global-status admin-page"><div className="wide"><AdminCheckInSummary participants={participants}/></div></div>
    {children}
  </>;
}
