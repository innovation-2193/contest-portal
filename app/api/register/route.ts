import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { code } from "../../../lib/codes";
import { getAdminSettings, isEventRegistrationOpen } from "../../../lib/admin-store";
import { transaction } from "../../../lib/db";
import { ensureDatabaseSchema } from "../../../lib/db-schema";
import {
  createLocalRegistration,
  findLocalRegistrationByCode,
  isDatabaseUnavailable,
  normalizeParticipantRole,
  type RegistrationRecord,
  type RegistrationInput,
} from "../../../lib/local-registrations";
import { sendRegistrationConfirmation } from "../../../lib/registration-artifacts";
import { participantSessionCookie, participantSessionMaxAge } from "../../../lib/participant-session";
import { isThaiCitizenId } from "../../../lib/validation";
import { recordAuditEvent } from "../../../lib/audit-log";
export const runtime = "nodejs";

const registration = z.object({
  email: z.string().email(), provider: z.enum(["google","microsoft","local"]).default("local"),
  title: z.string().min(1).max(32), firstName: z.string().min(2).max(120), lastName: z.string().min(2).max(120),
  citizenId: z.string().regex(/^\d{13}$/).refine(isThaiCitizenId,"หมายเลขบัตรประชาชนไม่ถูกต้อง"), phone: z.string().regex(/^0[689]\d{8}$/,"กรุณากรอกเบอร์มือถือ 10 หลักที่ขึ้นต้นด้วย 06, 08 หรือ 09"), position: z.string().min(1).max(255), division: z.string().min(2).max(255), bureau: z.string().min(2).max(255),
  consentPdpa: z.literal(true)
});
export async function POST(request: Request) {
  let data: RegistrationInput | undefined;
  try {
    if (!isEventRegistrationOpen(await getAdminSettings())) {
      return NextResponse.json({ error: "ขณะนี้ระบบปิดรับลงทะเบียนเข้าร่วมงาน" }, { status: 403 });
    }
    data = registration.parse(await request.json());
    const parsed = data;
    await ensureDatabaseSchema();
    const result = await transaction(async (connection) => {
      const userId = randomUUID(), registrationId = randomUUID(), registrationCode = code("REG");
      const [existingRows] = await connection.execute("SELECT registration_code FROM registrations WHERE citizen_id=? LIMIT 1", [parsed.citizenId]);
      if ((existingRows as Array<{registration_code:string}>).length > 0) {
        throw Object.assign(new Error("duplicate citizen id"), { code: "DUPLICATE_CITIZEN_ID" });
      }
      await connection.execute("INSERT INTO users(id,email,provider,display_name) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE display_name=VALUES(display_name),updated_at=CURRENT_TIMESTAMP(3)", [userId,parsed.email,parsed.provider,`${parsed.firstName} ${parsed.lastName}`]);
      const [users] = await connection.execute("SELECT id FROM users WHERE email=? LIMIT 1", [parsed.email]);
      const actualUserId = (users as Array<{id:string}>)[0].id;
      await connection.execute("INSERT INTO registrations(id,registration_code,user_id,title,first_name,last_name,citizen_id,phone,position,division,bureau,consent_pdpa) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)", [registrationId,registrationCode,actualUserId,parsed.title,parsed.firstName,parsed.lastName,parsed.citizenId,parsed.phone,parsed.position,parsed.division,parsed.bureau,true]);
      await connection.execute("INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,payload) VALUES(?,?,?,?,?)", [actualUserId,"registration.created","registration",registrationId,JSON.stringify({registrationCode})]);
      return { registrationCode, record: toRecord(parsed, registrationCode) };
    });
    const email = await sendRegistrationConfirmation(result.record);
    await recordRegistrationCreated(request, result.registrationCode, result.record.email);
    return registrationResponse(result.registrationCode, email.status);
  } catch (error) {
    if (data && isDatabaseUnavailable(error)) {
      try {
        const result = await createLocalRegistration(data);
        const email = await sendRegistrationConfirmation(result.record);
        await recordRegistrationCreated(request, result.registrationCode, result.record.email);
        return registrationResponse(result.registrationCode, email.status);
      } catch (localError) {
        const message = messageFor(localError);
        return NextResponse.json({ error: message }, { status: 422 });
      }
    }

    const message = messageFor(error);
    return NextResponse.json({ error: message }, { status: 422 });
  }
}

async function recordRegistrationCreated(request: Request, registrationCode: string, email: string) {
  await recordAuditEvent({
    actor: { type: "public", email },
    action: "registration.created",
    entityType: "registration",
    entityId: registrationCode,
    summary: `ลงทะเบียนเข้าร่วมงาน ${registrationCode}`,
    payload: { registrationCode },
  }, request.headers);
}

function registrationResponse(registrationCode: string, emailStatus: string) {
  const response = NextResponse.json({ registrationCode, emailStatus }, { status: 201 });
  response.cookies.set(participantSessionCookie, registrationCode, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: participantSessionMaxAge,
  });
  return response;
}

function toRecord(input: RegistrationInput, registrationCode: string): RegistrationRecord {
  return {
    registration_code: registrationCode,
    title: input.title,
    first_name: input.firstName,
    last_name: input.lastName,
    citizen_id: input.citizenId,
    phone: input.phone,
    position: input.position,
    division: input.division,
    bureau: input.bureau,
    participant_role: "Guest",
    status: "registered",
    checked_in_at: null,
    checked_in_by_email: null,
    registered_at: new Date().toISOString(),
    email: input.email.trim().toLowerCase(),
    provider: input.provider,
  };
}

export async function GET(request: Request) {
  const codeValue = new URL(request.url).searchParams.get("code");
  if (!codeValue) return NextResponse.json({error:"code is required"},{status:400});
  const { db } = await import("../../../lib/db");
  let row: unknown;
  try {
    await ensureDatabaseSchema();
    const [rows] = await db.execute("SELECT r.registration_code,r.participant_role,r.title,r.first_name,r.last_name,r.citizen_id,r.phone,r.position,r.division,r.bureau,r.status,r.checked_in_at,r.checked_in_by_email,r.registered_at,u.email,u.provider FROM registrations r JOIN users u ON u.id=r.user_id WHERE r.registration_code=? LIMIT 1",[codeValue]);
    const record = (rows as RegistrationRecord[])[0];
    row = record ? { ...record, participant_role: normalizeParticipantRole(record.participant_role) } : undefined;
  } catch (error) {
    if (!isDatabaseUnavailable(error)) throw error;
    row = await findLocalRegistrationByCode(codeValue);
  }
  return row?NextResponse.json(row):NextResponse.json({error:"not found"},{status:404});
}

function messageFor(error: unknown) {
  const code = (error as {code?:string}).code;
  return error instanceof z.ZodError
    ? error.issues[0]?.message
    : code === "DUPLICATE_CITIZEN_ID" || code === "ER_DUP_ENTRY"
      ? "หมายเลขบัตรประชาชนนี้ลงทะเบียนเข้าร่วมงานแล้ว ไม่สามารถสมัครซ้ำได้"
      : "ไม่สามารถบันทึกการลงทะเบียนได้";
}
