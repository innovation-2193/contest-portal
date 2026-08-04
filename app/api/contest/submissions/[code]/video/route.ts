import { NextResponse } from "next/server";
import { getSubmissionDetail } from "../../../../../../lib/admin-store";
import { checkVideoLink, normalizeVideoUrl } from "../../../../../../lib/video-link-status";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const submission = await getSubmissionDetail(decodeURIComponent(code));
  if (!submission) return NextResponse.json({ ok: false }, { status: 404 });

  const videoUrl = normalizeVideoUrl(submission.video_url);
  if (!videoUrl) return NextResponse.json({ ok: false }, { status: 200 });

  const videoStatus = await checkVideoLink(submission.video_url);
  if (videoStatus !== "ok") return NextResponse.json({ ok: false }, { status: 200 });

  return NextResponse.json({ ok: true, url: videoUrl.toString() }, {
    headers: { "Cache-Control": "public, max-age=60" },
  });
}
