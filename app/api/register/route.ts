import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { code } from "../../../lib/codes";
import { transaction } from "../../../lib/db";
import { isThaiCitizenId } from "../../../lib/validation";
export const runtime = "nodejs";

const registration = z.object({
  email: z.string().email(), provider: z.enum(["google","microsoft","local"]).default("local"),
  title: z.string().min(1).max(32), firstName: z.string().min(2).max(120), lastName: z.string().min(2).max(120),
  citizenId: z.string().regex(/^\d{13}$/).refine(isThaiCitizenId,"หมายเลขบัตรประชาชนไม่ถูกต้อง"), phone: z.string().regex(/^\d{9,10}$/), division: z.string().min(2).max(255), bureau: z.string().min(2).max(255),
  consentPdpa: z.literal(true)
});
export async function POST(request: Request) {
  try {
    const data = registration.parse(await request.json());
    const result = await transaction(async (connection) => {
      const userId = randomUUID(), registrationId = randomUUID(), registrationCode = code("REG");
      await connection.execute("INSERT INTO users(id,email,provider,display_name) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE display_name=VALUES(display_name),updated_at=CURRENT_TIMESTAMP(3)", [userId,data.email,data.provider,`${data.firstName} ${data.lastName}`]);
      const [users] = await connection.execute("SELECT id FROM users WHERE email=? LIMIT 1", [data.email]);
      const actualUserId = (users as Array<{id:string}>)[0].id;
      await connection.execute("INSERT INTO registrations(id,registration_code,user_id,title,first_name,last_name,citizen_id,phone,division,bureau,consent_pdpa) VALUES(?,?,?,?,?,?,?,?,?,?,?)", [registrationId,registrationCode,actualUserId,data.title,data.firstName,data.lastName,data.citizenId,data.phone,data.division,data.bureau,true]);
      await connection.execute("INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,payload) VALUES(?,?,?,?,?)", [actualUserId,"registration.created","registration",registrationId,JSON.stringify({registrationCode})]);
      return { registrationCode };
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const message = error instanceof z.ZodError ? error.issues[0]?.message : (error as {code?:string}).code === "ER_DUP_ENTRY" ? "อีเมลหรือเลขบัตรประชาชนนี้ลงทะเบียนแล้ว" : "ไม่สามารถบันทึกการลงทะเบียนได้";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}

export async function GET(request: Request) {
  const codeValue = new URL(request.url).searchParams.get("code");
  if (!codeValue) return NextResponse.json({error:"code is required"},{status:400});
  const { db } = await import("../../../lib/db");
  const [rows] = await db.execute("SELECT r.registration_code,r.title,r.first_name,r.last_name,r.phone,r.division,r.bureau,r.status,r.registered_at,u.email FROM registrations r JOIN users u ON u.id=r.user_id WHERE r.registration_code=? LIMIT 1",[codeValue]);
  const row=(rows as unknown[])[0];
  return row?NextResponse.json(row):NextResponse.json({error:"not found"},{status:404});
}
