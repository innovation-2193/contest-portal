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
      .sort(compareSubmittedAt)
      .map((submission, index) => ({
        code: submission.submission_code,
        title: submission.title_th,
        order: index + 1,
        ownerName: `${submission.first_name} ${submission.last_name}`.trim(),
        division: submission.division || submission.bureau || "",
      }));

    return NextResponse.json({ ok: true, submissions });
  } catch (error) {
    console.error("committee score submissions failed", error);
    return NextResponse.json({ ok: false, message: "โหลดรายการนวัตกรรมไม่สำเร็จ", submissions: [] }, { status: 200 });
  }
}

function compareSubmittedAt(left: { submitted_at: string }, right: { submitted_at: string }) {
  return new Date(left.submitted_at).getTime() - new Date(right.submitted_at).getTime();
}
