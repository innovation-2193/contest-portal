import { db } from "./db";
import {
  findLocalRegistrationByCode,
  isDatabaseUnavailable,
  type RegistrationRecord,
} from "./local-registrations";

export async function findRegistrationByCode(code: string) {
  try {
    const [rows] = await db.execute(
      "SELECT r.registration_code,r.title,r.first_name,r.last_name,r.citizen_id,r.phone,r.position,r.division,r.bureau,r.status,r.checked_in_at,r.registered_at,u.email,u.provider FROM registrations r JOIN users u ON u.id=r.user_id WHERE r.registration_code=? LIMIT 1",
      [code],
    );
    return (rows as RegistrationRecord[])[0] ?? null;
  } catch (error) {
    if (!isDatabaseUnavailable(error)) throw error;
    return findLocalRegistrationByCode(code);
  }
}
