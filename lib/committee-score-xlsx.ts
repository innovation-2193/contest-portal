import type { SubmissionListItem } from "./admin-store";
import {
  committeeJudges,
  type CommitteeScoreInput,
  type CommitteeScoreRecord,
} from "./committee-score-store";
import { defaultCommitteeJudgeProfiles, formatCommitteeJudgeProfile, type CommitteeJudgeProfile } from "./committee-score-config";
import { createSimpleXlsx } from "./simple-xlsx";
import { parseTabularFileRows } from "./tabular-file-reader";

export type CommitteeScoreImportResult = {
  records: CommitteeScoreInput[];
  deleteRecordIds: string[];
  errors: string[];
  changedCells: number;
  touchedSubmissions: number;
};

const baseHeaders = ["ลำดับ", "รหัสโครงการ", "ชื่อนวัตกรรม", "เจ้าของผลงาน", "หน่วยงาน"];
const summaryHeaders = ["เฉลี่ย", "จำนวนกรรมการที่กรอก"];
const maxImportRows = 600;

export function createCommitteeScoreTemplateXlsx(submissions: SubmissionListItem[], records: CommitteeScoreRecord[], judgeProfiles = defaultCommitteeJudgeProfiles()) {
  const rows = committeeScoreTemplateRows(submissions, records, judgeProfiles);
  return createSimpleXlsx({
    sheetName: "Committee Scores",
    title: "Committee total score import template",
    rows,
    columnWidths: [10, 18, 56, 28, 34, 18, 18, 18, 18, 18, 14, 18],
  });
}

export function createCommitteeScoreTemplateCsv(submissions: SubmissionListItem[], records: CommitteeScoreRecord[], judgeProfiles = defaultCommitteeJudgeProfiles()) {
  const rows = committeeScoreTemplateRows(submissions, records, judgeProfiles);
  return Buffer.from(`\uFEFF${rows.map(csvRow).join("\r\n")}\r\n`, "utf8");
}

function committeeScoreTemplateRows(submissions: SubmissionListItem[], records: CommitteeScoreRecord[], judgeProfiles: CommitteeJudgeProfile[]) {
  const latest = recordsBySubmissionAndJudge(records);
  const profiles = new Map(judgeProfiles.map((profile) => [profile.judgeKey, profile]));
  return [
    [
      ...baseHeaders,
      ...committeeJudges.map((judge) => `ก.${judge.order} ${formatCommitteeJudgeProfile(profiles.get(judge.key) ?? defaultCommitteeJudgeProfiles()[judge.order - 1])}`),
      ...summaryHeaders,
    ],
    ...submissions.map((submission, index) => {
      const rowRecords = latest.get(submission.submission_code) ?? new Map<string, CommitteeScoreRecord>();
      const scores = committeeJudges.map((judge) => rowRecords.get(judge.key)?.calculatedTotal ?? null);
      const filled = scores.filter((score): score is number => typeof score === "number" && Number.isFinite(score));
      const average = filled.length ? roundScore(filled.reduce((sum, score) => sum + score, 0) / filled.length) : null;
      return [
        String(index + 1),
        templateText(submission.submission_code),
        templateText(submission.title_th),
        templateText(`${submission.first_name} ${submission.last_name}`.trim()),
        templateText(submission.division || submission.bureau || ""),
        ...scores.map(scoreText),
        average === null ? "" : average.toFixed(2),
        `${filled.length}/5`,
      ];
    }),
  ];
}

export async function parseCommitteeScoreImportFile(
  file: File,
  submissions: SubmissionListItem[],
  existingRecords: CommitteeScoreRecord[],
): Promise<CommitteeScoreImportResult> {
  const rows = await parseTabularFileRows(file, { label: "คะแนน", maxBytes: 10 * 1024 * 1024 });
  const cleaned = rows
    .map((row) => row.map(normalizeCell))
    .filter((row) => row.some(Boolean));
  if (!cleaned.length) throw new Error("ไม่พบข้อมูลคะแนนในไฟล์");

  const header = detectHeader(cleaned[0]);
  if (!header) throw new Error("ไม่พบหัวตาราง กรุณาใช้ไฟล์ต้นแบบคะแนนคณะกรรมการจากระบบ");

  const dataRows = cleaned.slice(1);
  if (dataRows.length > maxImportRows) throw new Error(`นำเข้าได้สูงสุด ${maxImportRows.toLocaleString("th-TH")} แถวต่อไฟล์`);

  const submissionsByCode = new Map(submissions.map((submission, index) => [submission.submission_code, { submission, order: index + 1 }]));
  const existing = recordsBySubmissionAndJudge(existingRecords);
  const records: CommitteeScoreInput[] = [];
  const deleteRecordIds: string[] = [];
  const errors: string[] = [];
  const touchedSubmissionCodes = new Set<string>();
  let changedCells = 0;

  dataRows.forEach((row, rowIndex) => {
    const displayRow = rowIndex + 2;
    const submissionCode = normalizeSubmissionCode(cellAt(row, header.submissionCode));
    if (!submissionCode && !row.some(Boolean)) return;
    if (!submissionCode) {
      errors.push(`แถวที่ ${displayRow.toLocaleString("th-TH")}: ไม่พบรหัสโครงการ`);
      return;
    }

    const match = submissionsByCode.get(submissionCode);
    if (!match) {
      errors.push(`แถวที่ ${displayRow.toLocaleString("th-TH")}: ไม่พบรหัสโครงการ ${submissionCode} ในระบบ`);
      return;
    }

    for (const judge of committeeJudges) {
      const scoreIndex = header.judgeIndexes[judge.key];
      if (scoreIndex === undefined || scoreIndex < 0) continue;
      const rawScore = cellAt(row, scoreIndex);
      const existingRecord = existing.get(submissionCode)?.get(judge.key);
      const score = parseScore(rawScore);

      if (score.error) {
        errors.push(`แถวที่ ${displayRow.toLocaleString("th-TH")} ${submissionCode} ก.${judge.order}: ${score.error}`);
        continue;
      }

      if (score.value === null) {
        if (existingRecord) {
          deleteRecordIds.push(existingRecord.id);
          changedCells += 1;
          touchedSubmissionCodes.add(submissionCode);
        }
        continue;
      }

      if (existingRecord && existingRecord.calculatedTotal === score.value) continue;
      records.push({
        submissionCode,
        submissionTitle: match.submission.title_th,
        submissionOrder: match.order,
        judgeKey: judge.key,
        sourceFileName: file.name,
        sourcePage: displayRow,
        itemScores: {},
        totalScore: score.value,
        declaredTotal: score.value,
        note: "Excel total score import",
        submittedByEmail: "",
      });
      changedCells += 1;
      touchedSubmissionCodes.add(submissionCode);
    }
  });

  return {
    records,
    deleteRecordIds: [...new Set(deleteRecordIds)],
    errors,
    changedCells,
    touchedSubmissions: touchedSubmissionCodes.size,
  };
}

function detectHeader(row: string[]) {
  const normalized = row.map(normalizeHeader);
  const submissionCode = findHeaderIndex(normalized, ["รหัสโครงการ", "submission code", "submission_code", "code"]);
  const judgeIndexes = Object.fromEntries(committeeJudges.map((judge) => {
    const candidates = [
      `ก.${judge.order}`,
      `กรรมการ ${judge.order}`,
      `กรรมการที่ ${judge.order}`,
      judge.name,
      `${judge.rank}${judge.name}`,
    ].map(normalizeHeader);
    const index = normalized.findIndex((header) => candidates.some((candidate) => header === candidate || header.startsWith(`${candidate} `) || header.includes(candidate)));
    return [judge.key, index];
  })) as Record<string, number>;

  if (submissionCode < 0) return null;
  if (Object.values(judgeIndexes).some((index) => index < 0)) return null;
  return { submissionCode, judgeIndexes };
}

function recordsBySubmissionAndJudge(records: CommitteeScoreRecord[]) {
  const bySubmission = new Map<string, Map<string, CommitteeScoreRecord>>();
  for (const record of records) {
    const row = bySubmission.get(record.submissionCode) ?? new Map<string, CommitteeScoreRecord>();
    row.set(record.judgeKey, record);
    bySubmission.set(record.submissionCode, row);
  }
  return bySubmission;
}

function parseScore(value: string): { value: number | null; error: string | null } {
  const text = value.trim();
  if (!text) return { value: null, error: null };
  const normalized = text.includes(",") && !text.includes(".") && /^\d+,\d{1,2}$/.test(text)
    ? text.replace(",", ".")
    : text.replace(/,/g, "");
  const score = Number(normalized);
  if (!Number.isFinite(score)) return { value: null, error: "คะแนนต้องเป็นตัวเลข 0-100" };
  const rounded = roundScore(score);
  if (rounded < 0 || rounded > 100) return { value: null, error: "คะแนนต้องอยู่ระหว่าง 0-100" };
  return { value: rounded, error: null };
}

function normalizeSubmissionCode(value: string) {
  return value.trim().toUpperCase();
}

function normalizeCell(value: string) {
  return String(value ?? "").replace(/^\uFEFF/, "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, "").trim().replace(/\s+/g, " ");
}

function normalizeHeader(value: string) {
  return normalizeCell(value).toLowerCase();
}

function findHeaderIndex(headers: string[], candidates: string[]) {
  return headers.findIndex((header) => candidates.map(normalizeHeader).some((candidate) => header === candidate || header.includes(candidate)));
}

function cellAt(row: string[], index: number) {
  return index >= 0 ? row[index] ?? "" : "";
}

function scoreText(score: number | null | undefined) {
  return typeof score === "number" && Number.isFinite(score) ? String(roundScore(score)) : "";
}

function roundScore(value: number) {
  return Math.round(value * 100) / 100;
}

function templateText(value: unknown) {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function csvRow(row: string[]) {
  return row.map((value) => {
    const text = templateText(value);
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, "\"\"")}"` : text;
  }).join(",");
}
