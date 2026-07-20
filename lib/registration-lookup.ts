import { db } from "./db";
import { ensureDatabaseSchema } from "./db-schema";
import {
  findLocalRegistrationByCode,
  isDatabaseUnavailable,
  normalizeParticipantRole,
  type RegistrationRecord,
} from "./local-registrations";

export async function findRegistrationByCode(code: string) {
  try {
    await ensureDatabaseSchema();
    const [rows] = await db.execute(
      "SELECT r.registration_code,r.participant_role,r.title,r.first_name,r.last_name,r.citizen_id,r.phone,r.position,r.division,r.bureau,r.status,r.checked_in_at,r.checked_in_by_email,r.registered_at,u.email,u.provider FROM registrations r JOIN users u ON u.id=r.user_id WHERE r.registration_code=? LIMIT 1",
      [code],
    );
    const record = (rows as RegistrationRecord[])[0];
    return record ? { ...record, participant_role: normalizeParticipantRole(record.participant_role) } : null;
  } catch (error) {
    if (!isDatabaseUnavailable(error)) throw error;
    return findLocalRegistrationByCode(code);
  }
}
