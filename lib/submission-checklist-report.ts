import { type SubmissionChecklistRow } from "./admin-store";

export const checklistDocuments = [
  ["ownership", "3.1 หลักฐานความเป็นเจ้าของผลงาน"],
  ["concept", "3.2 แบบสรุปผลงานโดยย่อ"],
  ["prototype", "3.3 หลักฐานต้นแบบหรือการทดลอง"],
  ["implementation", "3.4 แผนต่อยอดใช้งานจริง"],
] as const;

export type ChecklistDocumentKey = typeof checklistDocuments[number][0];

export type VideoLinkStatus = "ok" | "missing" | "invalid" | "unreachable";

export type SubmissionChecklistReportRow = SubmissionChecklistRow & {
  ownerName: string;
  fileCount: number;
  fileComplete: boolean;
  missingDocuments: string[];
  videoStatus: VideoLinkStatus;
  videoStatusLabel: string;
};

export async function buildSubmissionChecklistReport(rows: SubmissionChecklistRow[]) {
  const checked = await mapWithConcurrency(rows, 6, async (row) => {
    const videoStatus = await checkVideoLink(row.video_url);
    const missingDocuments = checklistDocuments
      .filter(([key]) => !row.files[key])
      .map(([, label]) => label);
    return {
      ...row,
      ownerName: ownerName(row),
      fileCount: checklistDocuments.filter(([key]) => row.files[key]).length,
      fileComplete: missingDocuments.length === 0,
      missingDocuments,
      videoStatus,
      videoStatusLabel: videoStatusLabel(videoStatus),
    } satisfies SubmissionChecklistReportRow;
  });
  return checked;
}

export function videoProblemRows(rows: SubmissionChecklistReportRow[]) {
  return rows.filter((row) => row.videoStatus !== "ok");
}

export function videoStatusLabel(status: VideoLinkStatus) {
  if (status === "ok") return "เปิดได้";
  if (status === "missing") return "ไม่แนบลิงก์";
  if (status === "invalid") return "รูปแบบลิงก์ไม่ถูกต้อง";
  return "เปิดไม่ได้";
}

async function checkVideoLink(value?: string | null): Promise<VideoLinkStatus> {
  const urlText = value?.trim();
  if (!urlText) return "missing";
  let url: URL;
  try {
    url = new URL(urlText);
  } catch {
    return "invalid";
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return "invalid";

  const head = await tryFetch(url, "HEAD");
  if (head === "ok") return "ok";
  const get = await tryFetch(url, "GET");
  return get === "ok" ? "ok" : "unreachable";
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

async function mapWithConcurrency<T, R>(items: T[], limit: number, mapper: (item: T) => Promise<R>) {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

function ownerName(row: Pick<SubmissionChecklistRow, "title" | "first_name" | "last_name">) {
  return `${row.title}${row.first_name} ${row.last_name}`.replace(/\s+/g, " ").trim() || "-";
}
