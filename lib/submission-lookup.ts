import { db } from "./db";
import { isDatabaseUnavailable } from "./local-registrations";
import type { RegistrationRecord } from "./local-registrations";
import { findLocalSubmissionByCode, listLocalSubmissions, type LocalSubmissionRecord } from "./local-submissions";

const submissionSelect =
  "SELECT DISTINCT s.submission_code,s.submission_type,s.team_name,s.title_th,s.title_en,s.summary,s.status,s.submitted_at,u.email,m.title,m.first_name,m.last_name,m.citizen_id,m.phone,m.position,m.division,m.bureau FROM submissions s JOIN users u ON u.id=s.user_id JOIN submission_members m ON m.submission_id=s.id AND m.member_order=1";

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

export async function findSubmissionsByEmail(emailInput: string) {
  const email = emailInput.trim().toLowerCase();
  if (!email) return [];
  try {
    const [rows] = await db.execute(
      `SELECT DISTINCT s.submission_code,s.submission_type,s.team_name,s.title_th,s.title_en,s.summary,s.status,s.submitted_at,
        COALESCE(matched.email,u.email) AS email,
        COALESCE(matched.title,primary_member.title) AS title,
        COALESCE(matched.first_name,primary_member.first_name) AS first_name,
        COALESCE(matched.last_name,primary_member.last_name) AS last_name,
        COALESCE(matched.citizen_id,primary_member.citizen_id) AS citizen_id,
        COALESCE(matched.phone,primary_member.phone) AS phone,
        COALESCE(matched.position,primary_member.position) AS position,
        COALESCE(matched.division,primary_member.division) AS division,
        COALESCE(matched.bureau,primary_member.bureau) AS bureau
       FROM submissions s
       JOIN users u ON u.id=s.user_id
       JOIN submission_members primary_member ON primary_member.submission_id=s.id AND primary_member.member_order=1
       LEFT JOIN submission_members matched ON matched.submission_id=s.id AND LOWER(matched.email)=?
       WHERE LOWER(u.email)=? OR matched.member_order IS NOT NULL
       ORDER BY s.submitted_at DESC`,
      [email, email],
    );
    const databaseRows = uniqueSubmissionsByCode(rows as LocalSubmissionRecord[]);
    return databaseRows.length ? databaseRows : findLocalSubmissionsByEmail(email);
  } catch (error) {
    if (!isDatabaseUnavailable(error)) throw error;
    return findLocalSubmissionsByEmail(email);
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

async function findLocalSubmissionsByEmail(email: string) {
  const submissions = await listLocalSubmissions();
  return submissions
    .filter((item) => item.email.trim().toLowerCase() === email
      || item.members?.some((member) => member.email?.trim().toLowerCase() === email))
    .map((item) => localSubmissionForViewer(item, email))
    .filter(uniqueSubmissionFilter())
    .sort((a, b) => b.submitted_at.localeCompare(a.submitted_at));
}

function localSubmissionForViewer(submission: LocalSubmissionRecord, email: string): LocalSubmissionRecord {
  const matchedMember = submission.members?.find((member) => member.email?.trim().toLowerCase() === email);
  if (!matchedMember) return submission;
  return {
    ...submission,
    email: matchedMember.email.trim().toLowerCase(),
    title: matchedMember.title,
    first_name: matchedMember.first_name,
    last_name: matchedMember.last_name,
    citizen_id: matchedMember.citizen_id,
    phone: matchedMember.phone,
    position: matchedMember.position,
    division: matchedMember.division,
    bureau: matchedMember.bureau,
  };
}

function uniqueSubmissionsByCode(submissions: LocalSubmissionRecord[]) {
  return submissions.filter(uniqueSubmissionFilter());
}

function uniqueSubmissionFilter() {
  const seen = new Set<string>();
  return (submission: LocalSubmissionRecord) => {
    const key = submission.submission_code.trim().toUpperCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  };
}
