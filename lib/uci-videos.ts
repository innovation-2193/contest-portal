import { mkdir, readFile, rename, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

export type UciVideoRecord = {
  id: string;
  title: string;
  url: string;
  createdAt: string;
  updatedAt: string;
};

export type UciVideoInput = {
  title: string;
  url: string;
};

const storageDir = process.env.APP_STORAGE_DIR ?? path.join(process.cwd(), "storage");
const storePath = path.join(storageDir, "uci-videos.json");
let writeQueue: Promise<unknown> = Promise.resolve();

export async function listUciVideos() {
  const videos = await readStore();
  return videos.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

export async function createUciVideo(input: UciVideoInput) {
  const normalized = normalizeInput(input);
  return writeQueued(async () => {
    const videos = await readStore();
    const now = new Date().toISOString();
    const record: UciVideoRecord = {
      id: randomUUID(),
      ...normalized,
      createdAt: now,
      updatedAt: now,
    };
    videos.push(record);
    await writeStore(videos);
    return record;
  });
}

export async function updateUciVideo(id: string, input: UciVideoInput) {
  const normalized = normalizeInput(input);
  return writeQueued(async () => {
    const videos = await readStore();
    const index = videos.findIndex((video) => video.id === id.trim());
    if (index < 0) throw new Error("ไม่พบวิดีโอสาธิต");
    const current = videos[index];
    const next = { ...current, ...normalized, updatedAt: new Date().toISOString() };
    videos[index] = next;
    await writeStore(videos);
    return next;
  });
}

export async function deleteUciVideo(id: string) {
  return writeQueued(async () => {
    const videos = await readStore();
    await writeStore(videos.filter((video) => video.id !== id.trim()));
  });
}

export function youtubeVideoId(value: string) {
  try {
    const url = new URL(value.trim());
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (host === "youtu.be") return cleanVideoId(url.pathname.slice(1));
    if (host !== "youtube.com" && host !== "m.youtube.com") return null;
    if (url.searchParams.get("v")) return cleanVideoId(url.searchParams.get("v") ?? "");
    const pathParts = url.pathname.split("/").filter(Boolean);
    if (["embed", "shorts", "live"].includes(pathParts[0] ?? "")) return cleanVideoId(pathParts[1] ?? "");
    return null;
  } catch {
    return null;
  }
}

export function youtubeThumbnailUrl(value: string) {
  const id = youtubeVideoId(value);
  return id ? `https://img.youtube.com/vi/${encodeURIComponent(id)}/maxresdefault.jpg` : null;
}

function normalizeInput(input: UciVideoInput): UciVideoInput {
  const title = input.title.replace(/\s+/g, " ").trim();
  const url = input.url.trim();
  if (!title) throw new Error("กรุณาระบุชื่อคลิปวิดีโอ");
  if (title.length > 255) throw new Error("ชื่อคลิปวิดีโอยาวเกิน 255 ตัวอักษร");
  if (!youtubeVideoId(url)) throw new Error("กรุณาใส่ลิงก์ YouTube ที่ถูกต้อง");
  return { title, url };
}

function cleanVideoId(value: string) {
  const id = value.trim().split(/[?&#/]/)[0];
  return /^[A-Za-z0-9_-]{6,20}$/.test(id) ? id : null;
}

async function readStore(): Promise<UciVideoRecord[]> {
  try {
    const parsed = JSON.parse(await readFile(storePath, "utf8")) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isVideoRecord);
  } catch {
    return [];
  }
}

async function writeStore(videos: UciVideoRecord[]) {
  await mkdir(storageDir, { recursive: true });
  const tempPath = `${storePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tempPath, JSON.stringify(videos, null, 2), "utf8");
  await rename(tempPath, storePath);
}

function writeQueued<T>(task: () => Promise<T>) {
  const next = writeQueue.then(task, task);
  writeQueue = next.catch(() => undefined);
  return next;
}

function isVideoRecord(value: unknown): value is UciVideoRecord {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<UciVideoRecord>;
  return Boolean(item.id && item.title && item.url && item.createdAt && item.updatedAt && youtubeVideoId(item.url));
}
