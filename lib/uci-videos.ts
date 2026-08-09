import { mkdir, readFile, rename, unlink, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

export type UciVideoRecord = {
  id: string;
  title: string;
  url: string;
  thumbnailName: string | null;
  thumbnailOriginalName: string | null;
  createdAt: string;
  updatedAt: string;
};

export type UciVideoInput = {
  title: string;
  url: string;
  thumbnail?: File | null;
};

const storageDir = process.env.APP_STORAGE_DIR ?? path.join(process.cwd(), "storage");
const storePath = path.join(storageDir, "uci-videos.json");
const thumbnailDir = path.join(storageDir, "uci-video-thumbnails");
const maxThumbnailSize = 8 * 1024 * 1024;
const imageExtensions: Record<string, string> = {
  "image/gif": ".gif",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};
let writeQueue: Promise<unknown> = Promise.resolve();

export async function listUciVideos() {
  const videos = await readStore();
  return videos.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

export async function createUciVideo(input: UciVideoInput) {
  const normalized = normalizeInput(input);
  return writeQueued(async () => {
    const videos = await readStore();
    const thumbnail = await saveThumbnail(input.thumbnail);
    const now = new Date().toISOString();
    const record: UciVideoRecord = {
      id: randomUUID(),
      ...normalized,
      thumbnailName: thumbnail?.name ?? null,
      thumbnailOriginalName: thumbnail?.originalName ?? null,
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
    const thumbnail = await saveThumbnail(input.thumbnail);
    const next = {
      ...current,
      ...normalized,
      ...(thumbnail ? { thumbnailName: thumbnail.name, thumbnailOriginalName: thumbnail.originalName } : {}),
      updatedAt: new Date().toISOString(),
    };
    videos[index] = next;
    await writeStore(videos);
    if (thumbnail?.name && current.thumbnailName) await removeThumbnail(current.thumbnailName);
    return next;
  });
}

export async function deleteUciVideo(id: string) {
  return writeQueued(async () => {
    const videos = await readStore();
    const current = videos.find((video) => video.id === id.trim());
    await writeStore(videos.filter((video) => video.id !== id.trim()));
    if (current?.thumbnailName) await removeThumbnail(current.thumbnailName);
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

export function googleDriveFileId(value: string) {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || url.hostname.toLowerCase().replace(/^www\./, "") !== "drive.google.com") return null;
    const pathParts = url.pathname.split("/").filter(Boolean);
    const fileIndex = pathParts.indexOf("file");
    if (fileIndex >= 0 && pathParts[fileIndex + 1] === "d") return cleanDriveFileId(pathParts[fileIndex + 2] ?? "");
    return cleanDriveFileId(url.searchParams.get("id") ?? "");
  } catch {
    return null;
  }
}

export function uciVideoPlatform(value: string) {
  if (youtubeVideoId(value)) return "YouTube";
  if (googleDriveFileId(value)) return "Google Drive";
  return null;
}

export function getUciVideoThumbnailPath(name: string) {
  const decodedName = name.trim();
  if (!decodedName || path.basename(decodedName) !== decodedName || !/^[a-f0-9-]+\.(gif|jpg|png|webp)$/i.test(decodedName)) return null;
  return path.join(thumbnailDir, decodedName);
}

function normalizeInput(input: UciVideoInput): UciVideoInput {
  const title = input.title.replace(/\s+/g, " ").trim();
  const url = input.url.trim();
  if (!title) throw new Error("กรุณาระบุชื่อคลิปวิดีโอ");
  if (title.length > 255) throw new Error("ชื่อคลิปวิดีโอยาวเกิน 255 ตัวอักษร");
  if (!uciVideoPlatform(url)) throw new Error("กรุณาใส่ลิงก์ YouTube หรือ Google Drive ที่ถูกต้อง");
  return { title, url };
}

function cleanVideoId(value: string) {
  const id = value.trim().split(/[?&#/]/)[0];
  return /^[A-Za-z0-9_-]{6,20}$/.test(id) ? id : null;
}

function cleanDriveFileId(value: string) {
  const id = value.trim().split(/[?&#/]/)[0];
  return /^[A-Za-z0-9_-]{3,200}$/.test(id) ? id : null;
}

async function saveThumbnail(file: File | null | undefined) {
  if (!file || file.size <= 0) return null;
  if (file.size > maxThumbnailSize) throw new Error("ภาพปกต้องมีขนาดไม่เกิน 8 MB");
  const extension = imageExtensions[file.type] ?? path.extname(file.name).toLowerCase();
  if (!Object.values(imageExtensions).includes(extension)) throw new Error("กรุณาอัปโหลดภาพปกเป็น JPG, PNG, WEBP หรือ GIF");
  const name = `${randomUUID()}${extension}`;
  await mkdir(thumbnailDir, { recursive: true });
  await writeFile(path.join(thumbnailDir, name), Buffer.from(await file.arrayBuffer()));
  return { name, originalName: file.name.slice(0, 255) || name };
}

async function removeThumbnail(name: string) {
  const filePath = getUciVideoThumbnailPath(name);
  if (!filePath) return;
  await unlink(filePath).catch(() => undefined);
}

async function readStore(): Promise<UciVideoRecord[]> {
  try {
    const parsed = JSON.parse(await readFile(storePath, "utf8")) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isVideoRecord).map((video) => ({
      ...video,
      thumbnailName: typeof video.thumbnailName === "string" ? video.thumbnailName : null,
      thumbnailOriginalName: typeof video.thumbnailOriginalName === "string" ? video.thumbnailOriginalName : null,
    }));
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
  return Boolean(item.id && item.title && item.url && item.createdAt && item.updatedAt && uciVideoPlatform(item.url));
}
