import { NextResponse } from "next/server";
import { db } from "../../../lib/db";
export const runtime = "nodejs";
export async function GET() {
  const started = Date.now();
  try {
    const [rows] = await db.query("SELECT COUNT(*) AS tables_count FROM information_schema.tables WHERE table_schema=DATABASE()");
    return NextResponse.json({ status: "ready", database: "mysql", checks: { database: true, schema: Number((rows as Array<{tables_count:number}>)[0].tables_count) >= 7 }, latencyMs: Date.now()-started, timestamp: new Date().toISOString() });
  } catch (error) {
    return NextResponse.json({ status: "degraded", checks: { database: false }, error: error instanceof Error ? error.message : "database unavailable" }, { status: 503 });
  }
}
