import { mkdir, readFile, rename, writeFile } from "fs/promises";
import path from "path";

export type LocalSubmissionMember = {
  title: string;
  first_name: string;
  last_name: string;
  citizen_id: string;
  phone: string;
  email: string;
  position: string;
  division: string;
  bureau: string;
};

export type LocalSubmissionRecord = {
  upload_id?: string;
  submission_code: string;
  submission_type: "individual" | "team";
  team_name: string | null;
  title_th: string;
  title_en: string;
  summary: string;
  video_url: string;
  status: string;
  review_assigned_admin_email?: string | null;
  review_assigned_at?: string | null;
  review_scored_by_email?: string | null;
  review_rules_score?: number | null;
  review_problem_score?: number | null;
  review_innovation_score?: number | null;
  review_evidence_score?: number | null;
  review_impact_score?: number | null;
  review_total_score?: number | null;
  review_note?: string | null;
  review_submitted_at?: string | null;
  submitted_at: string;
  email: string;
  title: string;
  first_name: string;
  last_name: string;
  citizen_id: string;
  phone: string;
  position: string;
  division: string;
  bureau: string;
  members: LocalSubmissionMember[];
  files: Array<{
    document_type: string;
    original_name: string;
    stored_name: string;
    byte_size: number;
    sha256: string;
  }>;
};

export type LocalSubmissionUpdateInput = {
  submissionCode: string;
  email: string;
  submissionType: "individual" | "team";
  teamName: string | null;
  titleTh: string;
  titleEn: string;
  summary: string;
  videoUrl: string;
  status: string;
  members: LocalSubmissionMember[];
};

export type LocalSubmissionReviewInput = {
  submissionCode: string;
  assignedAdminEmail?: string | null;
  scoredByEmail?: string | null;
  rulesScore?: number | null;
  problemScore?: number | null;
  innovationScore?: number | null;
  evidenceScore?: number | null;
  impactScore?: number | null;
  totalScore?: number | null;
  note?: string | null;
  submittedAt?: string | null;
};

type LocalSubmissionInput = {
  submissionId?: string;
  submissionCode: string;
  data: {
    email: string;
    submissionType: "individual" | "team";
    teamName?: string;
    title: string;
    firstName: string;
    lastName: string;
    citizenId: string;
    phone: string;
    position: string;
    division: string;
    bureau: string;
    titleTh: string;
    titleEn?: string;
    summary: string;
    videoUrl?: string;
  };
  teamMembers: Array<{
    title: string;
    firstName: string;
    lastName: string;
    citizenId: string;
    phone: string;
    email: string;
    position: string;
    division: string;
    bureau: string;
  }>;
  files: Array<{
    type: string;
    original: string;
    stored: string;
    size: number;
    hash: string;
  }>;
};

type LocalSubmissionStore = {
  submissions: LocalSubmissionRecord[];
};

const storageDir = process.env.APP_STORAGE_DIR ?? path.join(process.cwd(), "storage");
const storePath = path.join(storageDir, "dev-submissions.json");

let writeQueue: Promise<unknown> = Promise.resolve();

export async function createLocalSubmission(input: LocalSubmissionInput) {
  const work = async () => {
    const store = await readStore();
    const data = input.data;
    const primary: LocalSubmissionMember = {
      title: data.title,
      first_name: data.firstName,
      last_name: data.lastName,
      citizen_id: data.citizenId,
      phone: data.phone,
      email: data.email.trim().toLowerCase(),
      position: data.position,
      division: data.division,
      bureau: data.bureau,
    };
    const members = [
      primary,
      ...input.teamMembers.map((member) => ({
        title: member.title,
        first_name: member.firstName,
        last_name: member.lastName,
        citizen_id: member.citizenId,
        phone: member.phone,
        email: member.email.trim().toLowerCase(),
        position: member.position,
        division: member.division,
        bureau: member.bureau,
      })),
    ];

    const record: LocalSubmissionRecord = {
      upload_id: input.submissionId,
      submission_code: input.submissionCode,
      submission_type: data.submissionType,
      team_name: data.submissionType === "team" ? data.teamName?.trim() || null : null,
      title_th: data.titleTh,
      title_en: data.titleEn ?? "",
      summary: data.summary,
      video_url: data.videoUrl ?? "",
      status: "submitted",
      review_assigned_admin_email: null,
      review_assigned_at: null,
      review_scored_by_email: null,
      review_rules_score: null,
      review_problem_score: null,
      review_innovation_score: null,
      review_evidence_score: null,
      review_impact_score: null,
      review_total_score: null,
      review_note: null,
      review_submitted_at: null,
      submitted_at: new Date().toISOString(),
      email: primary.email,
      title: primary.title,
      first_name: primary.first_name,
      last_name: primary.last_name,
      citizen_id: primary.citizen_id,
      phone: primary.phone,
      position: primary.position,
      division: primary.division,
      bureau: primary.bureau,
      members,
      files: input.files.map((file) => ({
        document_type: file.type,
        original_name: file.original,
        stored_name: file.stored,
        byte_size: file.size,
        sha256: file.hash,
      })),
    };

    store.submissions = [
      record,
      ...store.submissions.filter((item) => item.submission_code !== record.submission_code),
    ];
    await writeStore(store);
    return record;
  };

  const result = writeQueue.then(work, work);
  writeQueue = result.catch(() => undefined);
  return result;
}

export async function findLocalSubmissionByCode(submissionCode: string) {
  await writeQueue.catch(() => undefined);
  const store = await readStore();
  return store.submissions.find((item) => item.submission_code === submissionCode.trim()) ?? null;
}

export async function listLocalSubmissions() {
  await writeQueue.catch(() => undefined);
  const store = await readStore();
  return [...store.submissions].sort((a, b) => b.submitted_at.localeCompare(a.submitted_at));
}

export async function updateLocalSubmission(input: LocalSubmissionUpdateInput) {
  const work = async () => {
    const store = await readStore();
    const code = input.submissionCode.trim();
    const index = store.submissions.findIndex((item) => item.submission_code === code);
    if (index < 0) throw Object.assign(new Error("submission not found"), { code: "NOT_FOUND" });

    const current = store.submissions[index];
    const primary = input.members[0];
    if (!primary) throw new Error("primary member is required");
    const record: LocalSubmissionRecord = {
      ...current,
      submission_type: input.submissionType,
      team_name: input.submissionType === "team" ? input.teamName : null,
      title_th: input.titleTh,
      title_en: input.titleEn,
      summary: input.summary,
      video_url: input.videoUrl,
      status: input.status,
      email: input.email.trim().toLowerCase(),
      title: primary.title,
      first_name: primary.first_name,
      last_name: primary.last_name,
      citizen_id: primary.citizen_id,
      phone: primary.phone,
      position: primary.position,
      division: primary.division,
      bureau: primary.bureau,
      members: input.members,
    };
    store.submissions[index] = record;
    await writeStore(store);
    return record;
  };

  const result = writeQueue.then(work, work);
  writeQueue = result.catch(() => undefined);
  return result;
}

export async function updateLocalSubmissionReview(input: LocalSubmissionReviewInput) {
  const work = async () => {
    const store = await readStore();
    const code = input.submissionCode.trim();
    const index = store.submissions.findIndex((item) => item.submission_code === code);
    if (index < 0) throw Object.assign(new Error("submission not found"), { code: "NOT_FOUND" });

    const current = store.submissions[index];
    store.submissions[index] = {
      ...current,
      review_assigned_admin_email: input.assignedAdminEmail !== undefined ? input.assignedAdminEmail : current.review_assigned_admin_email ?? null,
      review_assigned_at: input.assignedAdminEmail !== undefined ? new Date().toISOString() : current.review_assigned_at ?? null,
      review_scored_by_email: input.scoredByEmail !== undefined ? input.scoredByEmail : current.review_scored_by_email ?? null,
      review_rules_score: input.rulesScore !== undefined ? input.rulesScore : current.review_rules_score ?? null,
      review_problem_score: input.problemScore !== undefined ? input.problemScore : current.review_problem_score ?? null,
      review_innovation_score: input.innovationScore !== undefined ? input.innovationScore : current.review_innovation_score ?? null,
      review_evidence_score: input.evidenceScore !== undefined ? input.evidenceScore : current.review_evidence_score ?? null,
      review_impact_score: input.impactScore !== undefined ? input.impactScore : current.review_impact_score ?? null,
      review_total_score: input.totalScore !== undefined ? input.totalScore : current.review_total_score ?? null,
      review_note: input.note !== undefined ? input.note : current.review_note ?? null,
      review_submitted_at: input.submittedAt !== undefined ? input.submittedAt : current.review_submitted_at ?? null,
    };
    await writeStore(store);
    return store.submissions[index];
  };

  const result = writeQueue.then(work, work);
  writeQueue = result.catch(() => undefined);
  return result;
}

async function readStore(): Promise<LocalSubmissionStore> {
  try {
    const parsed = JSON.parse(await readFile(storePath, "utf8")) as Partial<LocalSubmissionStore>;
    return { submissions: Array.isArray(parsed.submissions) ? parsed.submissions : [] };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { submissions: [] };
    throw error;
  }
}

async function writeStore(store: LocalSubmissionStore) {
  await mkdir(path.dirname(storePath), { recursive: true });
  const tempPath = `${storePath}.${process.pid}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
  await rename(tempPath, storePath);
}
