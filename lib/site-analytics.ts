import { mkdir, readFile, rename, writeFile } from "fs/promises";
import path from "path";

export type SiteDailyStat = {
  date: string;
  label: string;
  count: number;
};

export type SiteStats = {
  total: number;
  today: number;
  yesterday: number;
  average7Days: number;
  peakDay: SiteDailyStat;
  last7Days: SiteDailyStat[];
};

type SiteAnalyticsStore = {
  total: number;
  days: Record<string, number>;
};

const storageDir = process.env.APP_STORAGE_DIR ?? path.join(process.cwd(), "storage");
const analyticsPath = path.join(storageDir, "site-analytics.json");
const retentionDays = 120;

let writeQueue: Promise<unknown> = Promise.resolve();

export async function recordSiteVisit(pathname: string) {
  if (!shouldTrackPath(pathname)) return;
  const work = async () => {
    const store = pruneStore(await readStore());
    const today = todayKey();
    store.total += 1;
    store.days[today] = (store.days[today] ?? 0) + 1;
    await writeStore(store);
  };
  const next = writeQueue.then(work, work);
  writeQueue = next.catch(() => undefined);
  await next;
}

export async function getSiteStats(): Promise<SiteStats> {
  const store = pruneStore(await readStore());
  const today = todayKey();
  const yesterday = dateKey(-1);
  const last7Days = Array.from({ length: 7 }, (_, index) => {
    const date = dateKey(index - 6);
    return {
      date,
      label: shortThaiDate(date),
      count: store.days[date] ?? 0,
    };
  });
  const peakDay = last7Days.reduce((peak, item) => item.count > peak.count ? item : peak, last7Days[0] ?? { date: today, label: "วันนี้", count: 0 });
  const total7Days = last7Days.reduce((sum, item) => sum + item.count, 0);
  return {
    total: store.total,
    today: store.days[today] ?? 0,
    yesterday: store.days[yesterday] ?? 0,
    average7Days: Math.round(total7Days / 7),
    peakDay,
    last7Days,
  };
}

function shouldTrackPath(pathname: string) {
  const clean = pathname.trim();
  if (!clean || clean.startsWith("/api") || clean.startsWith("/admin") || clean === "/daily-report") return false;
  return true;
}

async function readStore(): Promise<SiteAnalyticsStore> {
  try {
    const parsed = JSON.parse(await readFile(analyticsPath, "utf8")) as Partial<SiteAnalyticsStore>;
    return {
      total: Number(parsed.total ?? 0),
      days: parsed.days && typeof parsed.days === "object" ? parsed.days : {},
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { total: 0, days: {} };
    throw error;
  }
}

async function writeStore(store: SiteAnalyticsStore) {
  await mkdir(path.dirname(analyticsPath), { recursive: true });
  const tempPath = `${analyticsPath}.${process.pid}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
  await rename(tempPath, analyticsPath);
}

function pruneStore(store: SiteAnalyticsStore) {
  const cutoff = dateKey(-(retentionDays - 1));
  return {
    total: Math.max(0, Number(store.total) || 0),
    days: Object.fromEntries(Object.entries(store.days ?? {}).filter(([date, count]) => date >= cutoff && Number(count) > 0)),
  };
}

function todayKey() {
  return dateKey(0);
}

function dateKey(offsetDays: number) {
  const date = new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function shortThaiDate(date: string) {
  return new Intl.DateTimeFormat("th-TH", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Bangkok",
  }).format(new Date(`${date}T00:00:00+07:00`));
}
