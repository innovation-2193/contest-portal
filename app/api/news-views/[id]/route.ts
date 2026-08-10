import { NextResponse } from "next/server";
import { incrementNewsViewCount, listNews } from "../../../../lib/admin-store";

export const runtime = "nodejs";

const cookieName = "news_viewed";
const viewWindowMs = 24 * 60 * 60 * 1000;
const cookieMaxAge = 30 * 24 * 60 * 60;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const newsId = decodeURIComponent(id).trim();
  const news = await listNews({ publicOnly: true });
  if (!news.some((item) => item.id === newsId)) return NextResponse.json({ ok: false, message: "ไม่พบข่าวประชาสัมพันธ์" }, { status: 404 });

  const now = Date.now();
  const viewed = readViewedCookie(request.headers.get("cookie"));
  const previous = viewed[newsId] ?? 0;
  const shouldCount = now - previous >= viewWindowMs;
  const viewCount = shouldCount ? await incrementNewsViewCount(newsId) : (news.find((item) => item.id === newsId)?.viewCount ?? 0);
  const nextViewed = Object.fromEntries(Object.entries({ ...viewed, ...(shouldCount ? { [newsId]: now } : {}) }).filter(([, timestamp]) => now - Number(timestamp) < cookieMaxAge * 1000).slice(-50));
  const response = NextResponse.json({ ok: true, viewCount, counted: shouldCount });
  response.cookies.set(cookieName, JSON.stringify(nextViewed), { httpOnly: true, sameSite: "lax", maxAge: cookieMaxAge, path: "/" });
  return response;
}

function readViewedCookie(header: string | null) {
  const raw = header?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
  if (!raw) return {} as Record<string, number>;
  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as Record<string, unknown>;
    return Object.fromEntries(Object.entries(parsed).filter(([, value]) => Number.isFinite(Number(value)))) as Record<string, number>;
  } catch {
    return {} as Record<string, number>;
  }
}
