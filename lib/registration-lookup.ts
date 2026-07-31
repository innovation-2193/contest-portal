import { db } from "./db";
import { ensureDatabaseSchema } from "./db-schema";
import {
  findLocalRegistrationByCode,
  isDatabaseUnavailable,
  listLocalRegistrations,
  normalizeParticipantRole,
  type RegistrationRecord,
} from "./local-registrations";

export async function findRegistrationByCode(code: string) {
  try {
    await ensureDatabaseSchema();
    const [rows] = await db.execute(
      "SELECT r.registration_code,r.participant_role,r.title,r.first_name,r.last_name,r.citizen_id,r.phone,r.position,r.division,r.bureau,r.status,r.checked_in_at,r.checked_in_by_email,r.registered_at,COALESCE(u.email,'') AS email,u.provider FROM registrations r JOIN users u ON u.id=r.user_id WHERE r.registration_code=? LIMIT 1",
      [code],
    );
    const record = (rows as RegistrationRecord[])[0];
    return record ? { ...record, participant_role: normalizeParticipantRole(record.participant_role) } : null;
  } catch (error) {
    if (!isDatabaseUnavailable(error)) throw error;
    return findLocalRegistrationByCode(code);
  }
}

export async function findRegistrationsByEmail(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) return [];
  try {
    await ensureDatabaseSchema();
    const [rows] = await db.execute(
      `SELECT r.registration_code,r.participant_role,r.title,r.first_name,r.last_name,r.citizen_id,r.phone,r.position,r.division,r.bureau,
              r.status,r.checked_in_at,r.checked_in_by_email,r.registered_at,COALESCE(u.email,'') AS email,u.provider
       FROM registrations r
       JOIN users u ON u.id=r.user_id
       WHERE LOWER(u.email)=?
       ORDER BY r.registered_at DESC`,
      [normalizedEmail],
    );
    return (rows as RegistrationRecord[]).map((record) => ({
      ...record,
      participant_role: normalizeParticipantRole(record.participant_role),
    }));
  } catch (error) {
    if (!isDatabaseUnavailable(error)) throw error;
    return (await listLocalRegistrations())
      .filter((record) => record.email.trim().toLowerCase() === normalizedEmail)
      .sort((left, right) => right.registered_at.localeCompare(left.registered_at));
  }
}
