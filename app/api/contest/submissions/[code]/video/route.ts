import { NextResponse } from "next/server";
import { getSubmissionDetail } from "../../../../../../lib/admin-store";

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

  const reachable = await isReachable(videoUrl);
  if (!reachable) return NextResponse.json({ ok: false }, { status: 200 });

  return NextResponse.json({ ok: true, url: videoUrl.toString() }, {
    headers: { "Cache-Control": "public, max-age=60" },
  });
}

function normalizeVideoUrl(value?: string | null) {
  const raw = value?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url;
  } catch {
    return null;
  }
}

async function isReachable(url: URL) {
  const head = await tryFetch(url, "HEAD");
  if (head) return true;
  return tryFetch(url, "GET");
}

async function tryFetch(url: URL, method: "HEAD" | "GET") {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4500);
  try {
    const response = await fetch(url, {
      method,
      redirect: "follow",
      cache: "no-store",
      signal: controller.signal,
      headers: method === "GET" ? { Range: "bytes=0-0" } : undefined,
    });
    return response.status >= 200 && response.status < 400;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}
