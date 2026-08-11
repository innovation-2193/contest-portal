import type { SubmissionListItem } from "./admin-store";
import type { CommitteeScoreInput, CommitteeScoreRecord } from "./committee-score-store";
import { committeeConsensusCriteria } from "./committee-score-config";
import { createSimpleXlsx } from "./simple-xlsx";
import { parseTabularFileRows } from "./tabular-file-reader";

export type CommitteeConsensusImportResult = {
  records: CommitteeScoreInput[];
  deleteRecordIds: string[];
  errors: string[];
  changedCells: number;
  touchedSubmissions: number;
};

const baseHeaders = ["ลำดับ", "ชื่อโครงการ", "รหัสโครงการ"];
const maxImportRows = 600;

export function createCommitteeConsensusTemplateXlsx(submissions: SubmissionListItem[], records: CommitteeScoreRecord[]) {
  return createSimpleXlsx({
    sheetName: "Committee Round 1 Shared",
    title: "Committee round 1 shared score import template",
    rows: committeeConsensusTemplateRows(submissions, records),
    columnWidths: [10, 56, 18, 18, 18, 18, 18, 18],
  });
}

export function createCommitteeConsensusTemplateCsv(submissions: SubmissionListItem[], records: CommitteeScoreRecord[]) {
  const rows = committeeConsensusTemplateRows(submissions, records);
  return Buffer.from(`\uFEFF${rows.map(csvRow).join("\r\n")}\r\n`, "utf8");
}

function committeeConsensusTemplateRows(submissions: SubmissionListItem[], records: CommitteeScoreRecord[]) {
  const byCode = new Map(records.filter((record) => record.judgeKey === "consensus").map((record) => [record.submissionCode, record]));
  return [
    [...baseHeaders, ...committeeConsensusCriteria.map((criterion) => criterion.label)],
    ...submissions.map((submission, index) => {
      const record = byCode.get(submission.submission_code);
      return [
        String(index + 1),
        templateText(submission.title_th),
        templateText(submission.submission_code),
        ...committeeConsensusCriteria.map((criterion) => scoreText(record?.itemScores[criterion.id])),
      ];
    }),
  ];
}

export async function parseCommitteeConsensusImportFile(
  file: File,
  submissions: SubmissionListItem[],
  existingRecords: CommitteeScoreRecord[],
): Promise<CommitteeConsensusImportResult> {
  const rows = await parseTabularFileRows(file, { label: "คะแนนทางเลือกที่ 2", maxBytes: 10 * 1024 * 1024 });
  const cleaned = rows.map((row) => row.map(normalizeCell)).filter((row) => row.some(Boolean));
  if (!cleaned.length) throw new Error("ไม่พบข้อมูลคะแนนในไฟล์");
  const header = detectHeader(cleaned[0]);
  if (!header) throw new Error("ไม่พบหัวตาราง กรุณาใช้ไฟล์ต้นแบบคะแนนรอบที่ 1 ทางเลือกที่ 2 จากระบบ");
  const dataRows = cleaned.slice(1);
  if (dataRows.length > maxImportRows) throw new Error(`นำเข้าได้สูงสุด ${maxImportRows.toLocaleString("th-TH")} แถวต่อไฟล์`);

  const submissionsByCode = new Map(submissions.map((submission, index) => [submission.submission_code, { submission, order: index + 1 }]));
  const existing = new Map(existingRecords.filter((record) => record.judgeKey === "consensus").map((record) => [record.submissionCode, record]));
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

    const itemScores: Record<string, number | null> = {};
    let hasAnyScore = false;
    let rowHasError = false;
    for (const criterion of committeeConsensusCriteria) {
      const rawScore = cellAt(row, header.scoreIndexes[criterion.id]);
      const score = parseScore(rawScore, criterion.max);
      if (score.error) {
        errors.push(`แถวที่ ${displayRow.toLocaleString("th-TH")} ${submissionCode} ${criterion.label}: ${score.error}`);
        rowHasError = true;
      }
      itemScores[criterion.id] = score.value;
      hasAnyScore ||= score.value !== null;
    }
    if (rowHasError) return;

    const existingRecord = existing.get(submissionCode);
    if (!hasAnyScore) {
      if (existingRecord) {
        deleteRecordIds.push(existingRecord.id);
        changedCells += committeeConsensusCriteria.length;
        touchedSubmissionCodes.add(submissionCode);
      }
      return;
    }

    const changed = committeeConsensusCriteria.some((criterion) => existingRecord?.itemScores[criterion.id] !== itemScores[criterion.id]);
    if (!changed) return;
    records.push({
      submissionCode,
      submissionTitle: match.submission.title_th,
      submissionOrder: match.order,
      judgeKey: "consensus",
      sourceFileName: file.name,
      sourcePage: displayRow,
      itemScores,
      totalScore: null,
      declaredTotal: null,
      note: "Excel consensus score import",
      submittedByEmail: "",
    });
    changedCells += committeeConsensusCriteria.filter((criterion) => existingRecord?.itemScores[criterion.id] !== itemScores[criterion.id]).length;
    touchedSubmissionCodes.add(submissionCode);
  });

  return { records, deleteRecordIds: [...new Set(deleteRecordIds)], errors, changedCells, touchedSubmissions: touchedSubmissionCodes.size };
}

function detectHeader(row: string[]) {
  const normalized = row.map(normalizeHeader);
  const submissionCode = findHeaderIndex(normalized, ["รหัสโครงการ", "submission code", "submission_code", "code"]);
  const scoreIndexes = Object.fromEntries(committeeConsensusCriteria.map((criterion, index) => {
    const candidates = [criterion.label, `คะแนนประเภทย่อย ${index + 1}`, `คะแนนย่อย ${index + 1}`, `ด้านที่ ${index + 1}`, String(index + 1)].map(normalizeHeader);
    const found = normalized.findIndex((header) => candidates.some((candidate) => header === candidate || header.startsWith(`${candidate} `) || header.includes(candidate)));
    return [criterion.id, found];
  })) as Record<string, number>;
  if (submissionCode < 0 || Object.values(scoreIndexes).some((index) => index < 0)) return null;
  return { submissionCode, scoreIndexes };
}

function parseScore(value: string, max: number): { value: number | null; error: string | null } {
  const text = value.trim();
  if (!text) return { value: null, error: null };
  const normalized = text.includes(",") && !text.includes(".") && /^\d+,\d{1,2}$/.test(text) ? text.replace(",", ".") : text.replace(/,/g, "");
  const score = Number(normalized);
  if (!Number.isFinite(score)) return { value: null, error: `คะแนนต้องเป็นตัวเลข 0-${max}` };
  const rounded = roundScore(score);
  if (rounded < 0 || rounded > max) return { value: null, error: `คะแนนต้องอยู่ระหว่าง 0-${max}` };
  return { value: rounded, error: null };
}

function normalizeSubmissionCode(value: string) { return value.trim().toUpperCase(); }
function normalizeCell(value: string) { return String(value ?? "").replace(/^\uFEFF/, "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, "").trim().replace(/\s+/g, " "); }
function normalizeHeader(value: string) { return normalizeCell(value).toLowerCase(); }
function findHeaderIndex(headers: string[], candidates: string[]) { return headers.findIndex((header) => candidates.map(normalizeHeader).some((candidate) => header === candidate || header.includes(candidate))); }
function cellAt(row: string[], index: number) { return index >= 0 ? row[index] ?? "" : ""; }
function scoreText(score: number | null | undefined) { return typeof score === "number" && Number.isFinite(score) ? String(roundScore(score)) : ""; }
function roundScore(value: number) { return Math.round(value * 100) / 100; }
function templateText(value: unknown) { return String(value ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, "").replace(/\s+/g, " ").trim(); }
function csvRow(row: string[]) { return row.map((value) => { const text = templateText(value); return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; }).join(","); }
