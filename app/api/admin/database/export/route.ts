import { escape as escapeSql } from "mysql2";
import { NextResponse } from "next/server";
import { actorFromAdminSession, recordAuditEvent } from "../../../../../lib/audit-log";
import { requireSuperAdminRequest } from "../../../../../lib/admin-guard";
import { db } from "../../../../../lib/db";

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
    const { sql, tableCount, rowCount } = await buildDatabaseDump();
    await recordAuditEvent({
      actor: actorFromAdminSession(session),
      action: "system.database_export",
      entityType: "database",
      summary: "Export ฐานข้อมูลทั้งระบบเป็น SQL",
      payload: { tableCount, rowCount, bytes: Buffer.byteLength(sql, "utf8") },
    }, request.headers);

    const date = new Date().toISOString().slice(0, 10);
    return new NextResponse(sql, {
      headers: {
        "Content-Type": "application/sql; charset=utf-8",
        "Content-Disposition": `attachment; filename="contest-portal-database-${date}.sql"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("database export failed", error);
    return NextResponse.json({ ok: false, message: "Export ฐานข้อมูลไม่สำเร็จ" }, { status: 500 });
  }
}

async function buildDatabaseDump() {
  const objects = await listDatabaseObjects();
  const tables = objects.filter((object) => object.type === "BASE TABLE");
  const views = objects.filter((object) => object.type === "VIEW");
  const chunks = [
    "-- Police Innovation Contest 2026 database export",
    `-- Created at: ${new Date().toISOString()}`,
    "-- This file contains database tables, rows, and views. Uploaded files are stored separately.",
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
  return { sql: chunks.join("\n"), tableCount: objects.length, rowCount };
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
