import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { actorFromAdminSession, recordAuditEvent } from "../../../../../../lib/audit-log";
import { cookieName, getAdminSession, superAdminEmails } from "../../../../../../lib/admin-auth";
import { adminUnauthorizedResponse } from "../../../../../../lib/admin-api-response";
import { getSubmissionDetail } from "../../../../../../lib/admin-store";
import { findAdminAccountByEmail } from "../../../../../../lib/admin-users";
import { submissionPrintPacketPdf } from "../../../../../../lib/submission-print-packet";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const cookieStore = await cookies();
  const session = getAdminSession(cookieStore.get(cookieName)?.value);
  if (!session) {
    return adminUnauthorizedResponse(request);
  }

  const { code } = await params;
  const submission = await getSubmissionDetail(decodeURIComponent(code));
  if (!submission) return NextResponse.json({ error: "submission not found" }, { status: 404 });
  if (session.role !== "super_admin" && submission.review_assigned_admin_email?.toLowerCase() !== session.email.toLowerCase()) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    await recordAuditEvent({
      actor: actorFromAdminSession(session),
      action: "submission.print_packet",
      entityType: "submission",
      entityId: submission.submission_code,
      summary: `เปิดชุดพิมพ์ใบสมัครประกวด ${submission.submission_code}`,
    }, request.headers);
    const reviewerLabel = await getReviewerLabel({
      assignedEmail: submission.review_assigned_admin_email,
      scoredEmail: submission.review_scored_by_email,
    });
    const packet = await submissionPrintPacketPdf(submission, { reviewerLabel });
    return new NextResponse(new Uint8Array(packet), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${submission.submission_code}-print-packet.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "ไม่สามารถสร้างไฟล์ PDF รวมได้" },
      { status: 500 },
    );
  }
}

async function getReviewerLabel(input: { assignedEmail: string | null; scoredEmail: string | null }) {
  const scoredEmail = input.scoredEmail?.trim().toLowerCase() || "";
  const assignedEmail = input.assignedEmail?.trim().toLowerCase() || "";
  const email = assignedEmail || scoredEmail;
  if (!email) return "ยังไม่ได้ระบุผู้ตรวจเอกสาร";

  const accountLabel = await getAdminDisplayName(email);
  return `${accountLabel} • ผู้ตรวจเอกสาร`;
}

async function getAdminDisplayName(email: string) {
  if (superAdminEmails.some((item) => item === email)) return `Super Admin (${email})`;
  const account = await findAdminAccountByEmail(email);
  if (account?.name) return `${account.name} (${account.email})`;
  return email;
}
