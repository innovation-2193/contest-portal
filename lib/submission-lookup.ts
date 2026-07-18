import { db } from "./db";
import { isDatabaseUnavailable } from "./local-registrations";
import type { RegistrationRecord } from "./local-registrations";
import { findLocalSubmissionByCode, listLocalSubmissions, type LocalSubmissionRecord } from "./local-submissions";

const submissionSelect =
  "SELECT s.submission_code,s.submission_type,s.team_name,s.title_th,s.title_en,s.summary,s.status,s.submitted_at,u.email,m.title,m.first_name,m.last_name,m.citizen_id,m.phone,m.position,m.division,m.bureau FROM submissions s JOIN users u ON u.id=s.user_id JOIN submission_members m ON m.submission_id=s.id AND m.member_order=1";

export async function findSubmissionByCode(code: string) {
  try {
    const [rows] = await db.execute(
      `${submissionSelect} WHERE s.submission_code=? LIMIT 1`,
      [code],
    );
    return (rows as LocalSubmissionRecord[])[0] ?? await findLocalSubmissionByCode(code);
  } catch (error) {
    if (!isDatabaseUnavailable(error)) throw error;
    return findLocalSubmissionByCode(code);
  }
}

export async function findSubmissionForRegistration(registration: Pick<RegistrationRecord, "email" | "citizen_id">) {
  const email = registration.email.trim().toLowerCase();
  const citizenId = registration.citizen_id.trim();

  try {
    const [rows] = await db.execute(
      `${submissionSelect} WHERE LOWER(u.email)=? OR m.citizen_id=? ORDER BY s.submitted_at DESC LIMIT 1`,
      [email, citizenId],
    );
    return (rows as LocalSubmissionRecord[])[0] ?? await findLocalSubmissionForRegistration(email, citizenId);
  } catch (error) {
    if (!isDatabaseUnavailable(error)) throw error;
    return findLocalSubmissionForRegistration(email, citizenId);
  }
}

async function findLocalSubmissionForRegistration(email: string, citizenId: string) {
  const submissions = await listLocalSubmissions();
  return submissions.find((item) => {
    const memberMatch = item.members?.some((member) => member.email === email || member.citizen_id === citizenId);
    return item.email === email || item.citizen_id === citizenId || memberMatch;
  }) ?? null;
}
