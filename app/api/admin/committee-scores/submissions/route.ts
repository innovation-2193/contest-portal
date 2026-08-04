import { NextResponse } from "next/server";
import { requireSuperAdminRequest } from "../../../../../lib/admin-guard";
import { listSubmissions } from "../../../../../lib/admin-store";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = requireSuperAdminRequest(request);
  if (!session) {
    return NextResponse.json({ ok: false, message: "unauthorized", submissions: [] }, { status: 401 });
  }

  try {
    const submissions = (await listSubmissions())
      .slice()
      .sort((a, b) => a.submitted_at.localeCompare(b.submitted_at))
      .map((submission, index) => ({
        code: submission.submission_code,
        title: submission.title_th,
        order: index + 1,
      }));

    return NextResponse.json({ ok: true, submissions });
  } catch (error) {
    console.error("committee score submissions failed", error);
    return NextResponse.json({ ok: false, message: "โหลดรายการนวัตกรรมไม่สำเร็จ", submissions: [] }, { status: 200 });
  }
}
