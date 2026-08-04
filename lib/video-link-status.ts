export type VideoLinkStatus = "ok" | "missing" | "invalid" | "unreachable";

export function videoStatusLabel(status: VideoLinkStatus) {
  if (status === "ok") return "เปิดได้";
  if (status === "missing") return "ไม่แนบลิงก์";
  if (status === "invalid") return "รูปแบบลิงก์ไม่ถูกต้อง";
  return "เปิดไม่ได้";
}

export async function checkVideoLink(value?: string | null): Promise<VideoLinkStatus> {
  const url = normalizeVideoUrl(value);
  if (!url) return value?.trim() ? "invalid" : "missing";

  const head = await tryFetch(url, "HEAD");
  if (head === "ok") return "ok";
  const get = await tryFetch(url, "GET");
  return get === "ok" ? "ok" : "unreachable";
}

export function normalizeVideoUrl(value?: string | null) {
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
    return response.status >= 200 && response.status < 400 ? "ok" : "failed";
  } catch {
    return "failed";
  } finally {
    clearTimeout(timeout);
  }
}
