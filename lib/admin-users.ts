import { createHash, randomBytes, randomUUID } from "crypto";
import { mkdir, readFile, rename, writeFile } from "fs/promises";
import path from "path";
import {
  adminSecureHash,
  createAdminPasswordHash,
  verifyStoredAdminPassword,
  type AdminRole,
} from "./admin-auth";
import { sendAdminMail } from "./admin-mail";

export type AdminAccount = {
  id: string;
  email: string;
  name: string;
  role: Extract<AdminRole, "admin">;
  passwordHash: string | null;
  resetTokenHash: string | null;
  resetTokenExpiresAt: string | null;
  disabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AdminAccountInput = {
  email: string;
  name: string;
  disabled?: boolean;
};

const storageDir = process.env.APP_STORAGE_DIR ?? path.join(process.cwd(), "storage");
const adminUsersPath = path.join(storageDir, "admin-users.json");
const resetTokenMaxAgeMs = 24 * 60 * 60 * 1000;
const resetTokenHashPrefix = "sha256:";

let writeQueue: Promise<unknown> = Promise.resolve();

export async function listAdminAccounts() {
  return (await readAdminAccounts()).sort((a, b) => a.email.localeCompare(b.email));
}

export async function findAdminAccountByEmail(email: string) {
  const normalized = normalizeEmail(email);
  return (await readAdminAccounts()).find((account) => account.email === normalized) ?? null;
}

export async function findAdminAccountById(id: string) {
  const targetId = id.trim();
  return (await readAdminAccounts()).find((account) => account.id === targetId) ?? null;
}

export async function verifyAdminAccountPassword(email: string, password: string) {
  const account = await findAdminAccountByEmail(email);
  if (!account || account.disabled) return null;
  if (!verifyStoredAdminPassword(password, account.passwordHash)) return null;
  return account;
}

export async function createAdminAccount(input: AdminAccountInput) {
  return enqueueWrite(async () => {
    const accounts = await readAdminAccounts();
    const email = normalizeEmail(input.email);
    if (!isValidEmail(email)) throw new Error("อีเมลแอดมินไม่ถูกต้อง");
    if (accounts.some((account) => account.email === email)) throw new Error("มีอีเมลนี้ในระบบแล้ว");
    const now = new Date().toISOString();
    const account: AdminAccount = {
      id: randomUUID(),
      email,
      name: input.name.trim(),
      role: "admin",
      passwordHash: null,
      resetTokenHash: null,
      resetTokenExpiresAt: null,
      disabled: Boolean(input.disabled),
      createdAt: now,
      updatedAt: now,
    };
    accounts.push(account);
    await writeAdminAccounts(accounts);
    return account;
  });
}

export async function updateAdminAccount(id: string, input: AdminAccountInput) {
  return enqueueWrite(async () => {
    const accounts = await readAdminAccounts();
    const targetIndex = accounts.findIndex((account) => account.id === id.trim());
    if (targetIndex < 0) throw new Error("ไม่พบแอดมิน");
    const email = normalizeEmail(input.email);
    if (!isValidEmail(email)) throw new Error("อีเมลแอดมินไม่ถูกต้อง");
    if (accounts.some((account) => account.id !== id.trim() && account.email === email)) throw new Error("มีอีเมลนี้ในระบบแล้ว");
    accounts[targetIndex] = {
      ...accounts[targetIndex],
      email,
      name: input.name.trim(),
      disabled: Boolean(input.disabled),
      updatedAt: new Date().toISOString(),
    };
    await writeAdminAccounts(accounts);
    return accounts[targetIndex];
  });
}

export async function deleteAdminAccount(id: string) {
  return enqueueWrite(async () => {
    const accounts = await readAdminAccounts();
    await writeAdminAccounts(accounts.filter((account) => account.id !== id.trim()));
  });
}

export async function createAdminPasswordLink(id: string) {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createPasswordResetTokenHash(token);
  const expiresAt = new Date(Date.now() + resetTokenMaxAgeMs).toISOString();
  const account = await enqueueWrite(async () => {
    const accounts = await readAdminAccounts();
    const targetIndex = accounts.findIndex((item) => item.id === id.trim());
    if (targetIndex < 0) throw new Error("ไม่พบแอดมิน");
    accounts[targetIndex] = {
      ...accounts[targetIndex],
      resetTokenHash: tokenHash,
      resetTokenExpiresAt: expiresAt,
      updatedAt: new Date().toISOString(),
    };
    await writeAdminAccounts(accounts);
    return accounts[targetIndex];
  });
  const url = `${publicBaseUrl()}/admin/password/${encodeURIComponent(token)}`;
  await sendAdminMail({
    to: account.email,
    subject: "ลิงก์ตั้งรหัสผ่านผู้ดูแลระบบ",
    text: `กรุณาตั้งรหัสผ่านผู้ดูแลระบบที่ลิงก์นี้: ${url}\nลิงก์หมดอายุภายใน 24 ชั่วโมง`,
    html: `<p>กรุณาตั้งรหัสผ่านผู้ดูแลระบบจากปุ่มด้านล่าง</p><p><a href="${escapeHtml(url)}" style="display:inline-block;background:#123c73;color:#ffffff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:700">ตั้งรหัสผ่าน</a></p><p>ลิงก์หมดอายุภายใน 24 ชั่วโมง</p>`,
    outboxKey: `admin-password-${account.email}-${Date.now()}`,
  });
  return { account, url, expiresAt };
}

export async function getAdminAccountByResetToken(token: string) {
  const normalizedToken = normalizeResetToken(token);
  const now = Date.now();
  return (await readAdminAccounts()).find((account) => (
    passwordResetTokenMatches(account.resetTokenHash, normalizedToken)
    && isResetTokenActive(account.resetTokenExpiresAt, now)
    && !account.disabled
  )) ?? null;
}

export async function setAdminPasswordByResetToken(token: string, password: string) {
  if (password.length < 8) throw new Error("รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร");
  const normalizedToken = normalizeResetToken(token);
  return enqueueWrite(async () => {
    const accounts = await readAdminAccounts();
    const targetIndex = accounts.findIndex((account) => (
      passwordResetTokenMatches(account.resetTokenHash, normalizedToken)
      && isResetTokenActive(account.resetTokenExpiresAt)
      && !account.disabled
    ));
    if (targetIndex < 0) throw new Error("ลิงก์ตั้งรหัสผ่านหมดอายุหรือไม่ถูกต้อง");
    accounts[targetIndex] = {
      ...accounts[targetIndex],
      passwordHash: createAdminPasswordHash(password),
      resetTokenHash: null,
      resetTokenExpiresAt: null,
      updatedAt: new Date().toISOString(),
    };
    await writeAdminAccounts(accounts);
    return accounts[targetIndex];
  });
}

async function readAdminAccounts(): Promise<AdminAccount[]> {
  try {
    const parsed = JSON.parse(await readFile(adminUsersPath, "utf8")) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeAdminAccount).filter((account): account is AdminAccount => Boolean(account));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    if (error instanceof SyntaxError) {
      console.warn("admin users store is invalid JSON", error);
      return [];
    }
    throw error;
  }
}

async function writeAdminAccounts(accounts: AdminAccount[]) {
  await mkdir(path.dirname(adminUsersPath), { recursive: true });
  const tempPath = `${adminUsersPath}.${process.pid}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(accounts, null, 2)}\n`, "utf8");
  await rename(tempPath, adminUsersPath);
}

function enqueueWrite<T>(work: () => Promise<T>) {
  const next = writeQueue.then(work, work);
  writeQueue = next.catch(() => undefined);
  return next;
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function normalizeAdminAccount(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<AdminAccount>;
  const id = textValue(raw.id);
  const email = normalizeEmail(textValue(raw.email));
  if (!id || !isValidEmail(email)) return null;
  const now = new Date().toISOString();
  return {
    id,
    email,
    name: textValue(raw.name),
    role: "admin" as const,
    passwordHash: nullableText(raw.passwordHash),
    resetTokenHash: nullableText(raw.resetTokenHash),
    resetTokenExpiresAt: nullableText(raw.resetTokenExpiresAt),
    disabled: Boolean(raw.disabled),
    createdAt: validDateText(raw.createdAt) ?? now,
    updatedAt: validDateText(raw.updatedAt) ?? validDateText(raw.createdAt) ?? now,
  };
}

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function nullableText(value: unknown) {
  const text = textValue(value);
  return text || null;
}

function validDateText(value: unknown) {
  const text = textValue(value);
  if (!text) return null;
  const date = new Date(text);
  return Number.isFinite(date.getTime()) ? text : null;
}

function normalizeResetToken(input: string) {
  let value = input.trim();
  try {
    const parsed = new URL(value);
    value = parsed.pathname.split("/").filter(Boolean).pop() ?? value;
  } catch {
    const marker = "/admin/password/";
    const markerIndex = value.indexOf(marker);
    if (markerIndex >= 0) value = value.slice(markerIndex + marker.length);
  }
  value = value.split(/[?#]/, 1)[0] ?? "";
  value = value.replace(/[).,;:!?]+$/g, "");
  try {
    return decodeURIComponent(value).trim();
  } catch {
    return value.trim();
  }
}

function createPasswordResetTokenHash(token: string) {
  return `${resetTokenHashPrefix}${createHash("sha256").update(normalizeResetToken(token)).digest("hex")}`;
}

function passwordResetTokenMatches(storedHash: string | null | undefined, token: string) {
  if (!storedHash || !token) return false;
  return storedHash === createPasswordResetTokenHash(token)
    || storedHash === adminSecureHash(token, "admin-password-reset");
}

function isResetTokenActive(expiresAt: string | null | undefined, now = Date.now()) {
  if (!expiresAt) return false;
  const expiresAtMs = new Date(expiresAt).getTime();
  return Number.isFinite(expiresAtMs) && expiresAtMs > now;
}

function publicBaseUrl() {
  return (process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3003").replace(/\/$/, "");
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
