import { escape as escapeSql } from "mysql2";
import { readdir, readFile, stat } from "fs/promises";
import { NextResponse } from "next/server";
import path from "path";
import { actorFromAdminSession, recordAuditEvent } from "../../../../../lib/audit-log";
import { requireSuperAdminRequest } from "../../../../../lib/admin-guard";
import { db } from "../../../../../lib/db";
import { createZip, type ZipEntry } from "../../../../../lib/zip";

export const runtime = "nodejs";

type DatabaseObject = {
  name: string;
  type: "BASE TABLE" | "VIEW";
};

type DatabaseRow = Record<string, unknown>;

export async function GET(request: Request) {
  const session = requireSuperAdminRequest(request);
  if (!session) {
    return NextResponse.json({ ok: false, message: "unauthorized" }, { status: 401 });
  }

  try {
    const { archive, databaseName, tableCount, rowCount, storageFileCount, storageBytes } = await buildFullBackup();
    await recordAuditEvent({
      actor: actorFromAdminSession(session),
      action: "system.database_export",
      entityType: "database",
      summary: "Export Full Backup ฐานข้อมูลและไฟล์เว็บไซต์ทั้งระบบ",
      payload: { databaseName, tableCount, rowCount, storageFileCount, storageBytes, bytes: archive.length },
    }, request.headers);

    const date = new Date().toISOString().slice(0, 10);
    return new NextResponse(new Uint8Array(archive), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="contest-portal-full-backup-${date}.zip"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("database export failed", error);
    return NextResponse.json({ ok: false, message: "Export ฐานข้อมูลไม่สำเร็จ" }, { status: 500 });
  }
}

async function buildFullBackup() {
  const { sql, databaseName, tableCount, rowCount } = await buildDatabaseDump();
  const storage = await collectStorageFiles();
  const manifest = {
    backupType: "Police Innovation Contest 2026 full website backup",
    createdAt: new Date().toISOString(),
    databaseName,
    database: { file: "database.sql", tableCount, rowCount },
    storage: { directory: "storage/", fileCount: storage.fileCount, bytes: storage.bytes },
    excludedVolatileFiles: ["admin-login-attempts.json", "admin-super-otp.json", "participant-login-otps.json", "*.tmp"],
  };
  const entries: ZipEntry[] = [
    { name: "database.sql", data: Buffer.from(sql, "utf8") },
    { name: "backup-manifest.json", data: Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8") },
    ...storage.entries,
  ];
  return { archive: createZip(entries), databaseName, tableCount, rowCount, storageFileCount: storage.fileCount, storageBytes: storage.bytes };
}

async function buildDatabaseDump() {
  const databaseName = await currentDatabaseName();
  const objects = await listDatabaseObjects();
  const tables = objects.filter((object) => object.type === "BASE TABLE");
  const views = objects.filter((object) => object.type === "VIEW");
  const chunks = [
    "-- Police Innovation Contest 2026 database export",
    `-- Created at: ${new Date().toISOString()}`,
    `-- Database: ${databaseName}`,
    "-- This file contains every visible table, row, and view in the application database.",
    "SET NAMES utf8mb4;",
    "SET FOREIGN_KEY_CHECKS=0;",
    "",
  ];
  let rowCount = 0;

  for (const table of tables) {
    const { createSql, rows, columns } = await readTable(table.name);
    chunks.push(`DROP TABLE IF EXISTS ${quoteIdentifier(table.name)};`, `${createSql};`, "");
    if (rows.length) {
      rowCount += rows.length;
      const columnList = columns.map(quoteIdentifier).join(",");
      for (let index = 0; index < rows.length; index += 250) {
        const batch = rows.slice(index, index + 250);
        const values = batch.map((row) => `(${columns.map((column) => sqlValue(row[column])).join(",")})`).join(",\n");
        chunks.push(`INSERT INTO ${quoteIdentifier(table.name)} (${columnList}) VALUES\n${values};`);
      }
      chunks.push("");
    }
  }

  for (const view of views) {
    const createSql = await readCreateStatement(view.name, "VIEW");
    chunks.push(`DROP VIEW IF EXISTS ${quoteIdentifier(view.name)};`, `${createSql};`, "");
  }

  chunks.push("SET FOREIGN_KEY_CHECKS=1;", "");
  return { sql: chunks.join("\n"), databaseName, tableCount: objects.length, rowCount };
}

async function currentDatabaseName() {
  const [rows] = await db.query("SELECT DATABASE() AS database_name") as [Array<{ database_name: unknown }>, unknown];
  return String(rows[0]?.database_name ?? "").trim() || "unknown";
}

const storageDir = process.env.APP_STORAGE_DIR ?? path.join(process.cwd(), "storage");
const excludedStorageFiles = new Set(["admin-login-attempts.json", "admin-super-otp.json", "participant-login-otps.json"]);

async function collectStorageFiles() {
  const entries: ZipEntry[] = [];
  let bytes = 0;
  try {
    await walkStorage(path.resolve(/* turbopackIgnore: true */ storageDir), "", entries, (size) => { bytes += size; });
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code !== "ENOENT") throw error;
  }
  return { entries, fileCount: entries.length, bytes };
}

async function walkStorage(root: string, relativeDir: string, entries: ZipEntry[], countBytes: (size: number) => void) {
  const currentDir = path.join(root, relativeDir);
  const children = await readdir(currentDir, { withFileTypes: true });
  for (const child of children) {
    if (child.isSymbolicLink()) continue;
    const relativePath = path.join(relativeDir, child.name);
    if (child.isDirectory()) {
      await walkStorage(root, relativePath, entries, countBytes);
      continue;
    }
    if (!child.isFile() || excludedStorageFiles.has(child.name) || child.name.endsWith(".tmp") || child.name === ".DS_Store") continue;
    const filePath = path.join(root, relativePath);
    const [data, details] = await Promise.all([readFile(filePath), stat(filePath)]);
    entries.push({ name: path.posix.join("storage", relativePath.split(path.sep).join("/")), data, modifiedAt: details.mtime });
    countBytes(data.length);
  }
}

async function listDatabaseObjects(): Promise<DatabaseObject[]> {
  const [rows] = await db.query("SHOW FULL TABLES") as [DatabaseRow[], unknown];
  const nameKey = Object.keys(rows[0] ?? {}).find((key) => key.toLowerCase().startsWith("tables_in_"));
  if (!nameKey) return [];
  return rows
    .map((row) => ({ name: String(row[nameKey] ?? ""), type: String(row.Table_type ?? "") as DatabaseObject["type"] }))
    .filter((object): object is DatabaseObject => Boolean(object.name) && (object.type === "BASE TABLE" || object.type === "VIEW"))
    .sort((left, right) => left.name.localeCompare(right.name));
}

async function readTable(name: string) {
  const createSql = await readCreateStatement(name, "TABLE");
  const [rows, fields] = await db.query(`SELECT * FROM ${quoteIdentifier(name)}`) as [DatabaseRow[], Array<{ name: string }>];
  return { createSql, rows, columns: fields.map((field) => field.name) };
}

async function readCreateStatement(name: string, type: "TABLE" | "VIEW") {
  const [rows] = await db.query(`SHOW CREATE ${type} ${quoteIdentifier(name)}`) as [DatabaseRow[], unknown];
  const key = type === "TABLE" ? "Create Table" : "Create View";
  const statement = String(rows[0]?.[key] ?? "").trim();
  if (!statement) throw new Error(`ไม่พบโครงสร้าง ${type} ${name}`);
  return statement;
}

function quoteIdentifier(value: string) {
  return `\`${value.replace(/`/g, "``")}\``;
}

function sqlValue(value: unknown) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "object" && !(value instanceof Date) && !Buffer.isBuffer(value)) {
    return escapeSql(JSON.stringify(value));
  }
  return escapeSql(value as never);
}
