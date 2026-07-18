import { randomBytes, randomUUID } from "crypto";
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
  const tokenHash = adminSecureHash(token, "admin-password-reset");
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
  const tokenHash = adminSecureHash(token.trim(), "admin-password-reset");
  const now = Date.now();
  return (await readAdminAccounts()).find((account) => (
    account.resetTokenHash === tokenHash
    && account.resetTokenExpiresAt
    && new Date(account.resetTokenExpiresAt).getTime() > now
    && !account.disabled
  )) ?? null;
}

export async function setAdminPasswordByResetToken(token: string, password: string) {
  if (password.length < 8) throw new Error("รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร");
  const tokenHash = adminSecureHash(token.trim(), "admin-password-reset");
  return enqueueWrite(async () => {
    const accounts = await readAdminAccounts();
    const targetIndex = accounts.findIndex((account) => (
      account.resetTokenHash === tokenHash
      && account.resetTokenExpiresAt
      && new Date(account.resetTokenExpiresAt).getTime() > Date.now()
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
    return JSON.parse(await readFile(adminUsersPath, "utf8")) as AdminAccount[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
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
