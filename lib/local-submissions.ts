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
