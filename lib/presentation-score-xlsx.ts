import type { SubmissionListItem } from "./admin-store";
import { createSimpleXlsx } from "./simple-xlsx";
import { parseTabularFileRows } from "./tabular-file-reader";
import type { PresentationJudgeProfile } from "./presentation-score-config";
import { formatPresentationJudge } from "./presentation-score-config";
import type { PresentationScoreInput, PresentationScoreRecord } from "./presentation-score-store";

export type PresentationScoreImportResult = {
  records: PresentationScoreInput[];
  deleteRecordIds: string[];
  errors: string[];
  changedCells: number;
  touchedSubmissions: number;
};

export function createPresentationScoreTemplateXlsx(submissions: SubmissionListItem[], records: PresentationScoreRecord[], profiles: PresentationJudgeProfile[]) {
  const existing = new Map(records.map((record) => [`${record.submissionCode}:${record.judgeKey}`, record]));
  const rows = [
    ["ลำดับ", "ชื่อโครงการ", "รหัสโครงการ", ...profiles.map((profile, index) => `กรรมการ ${index + 1} ${formatPresentationJudge(profile)}`)],
    ...submissions.map((submission, index) => [String(index + 1), submission.title_th, submission.submission_code, ...profiles.map((profile) => scoreText(existing.get(`${submission.submission_code}:${profile.judgeKey}`)?.calculatedTotal))]),
  ];
  return createSimpleXlsx({ sheetName: "Presentation Scores", title: "Presentation score template round 2", rows, columnWidths: [10, 58, 18, ...profiles.map(() => 24)] });
}

export async function parsePresentationScoreImportFile(file: File, submissions: SubmissionListItem[], profiles: PresentationJudgeProfile[], existingRecords: PresentationScoreRecord[]) {
  const rows = (await parseTabularFileRows(file, { label: "คะแนนรอบที่ 2", maxBytes: 10 * 1024 * 1024 })).map((row) => row.map(normalizeCell)).filter((row) => row.some(Boolean));
  if (!rows.length) throw new Error("ไม่พบข้อมูลคะแนนในไฟล์");
  const header = rows[0].map(normalizeHeader);
  const codeIndex = findHeader(header, ["รหัสโครงการ", "submission code", "submission_code", "code"]);
  if (codeIndex < 0) throw new Error("ไม่พบหัวตารางรหัสโครงการ กรุณาใช้ Template รอบที่ 2");
  const judgeIndexes = profiles.map((profile, index) => ({ profile, index: findHeader(header, [`กรรมการ ${index + 1}`, formatPresentationJudge(profile), profile.judgeKey]) }));
  if (judgeIndexes.some((item) => item.index < 0)) throw new Error("ไม่พบคอลัมน์คะแนนกรรมการครบทุกคน กรุณาใช้ Template ล่าสุด");
  const submissionMap = new Map(submissions.map((submission, index) => [submission.submission_code, { submission, order: index + 1 }]));
  const existing = new Map(existingRecords.map((record) => [`${record.submissionCode}:${record.judgeKey}`, record]));
  const records: PresentationScoreInput[] = [];
  const deleteRecordIds: string[] = [];
  const errors: string[] = [];
  const touched = new Set<string>();
  let changedCells = 0;
  rows.slice(1).forEach((row, rowIndex) => {
    const displayRow = rowIndex + 2;
    const code = normalizeCell(row[codeIndex]).toUpperCase();
    if (!code) return;
    const match = submissionMap.get(code);
    if (!match) { errors.push(`แถวที่ ${displayRow}: ไม่พบรหัสโครงการ ${code} ในประกาศผลการแข่งขัน`); return; }
    for (const item of judgeIndexes) {
      const existingRecord = existing.get(`${code}:${item.profile.judgeKey}`);
      const parsed = parseScore(row[item.index] ?? "");
      if (parsed.error) { errors.push(`แถวที่ ${displayRow} ${formatPresentationJudge(item.profile)}: ${parsed.error}`); continue; }
      if (parsed.value === null) {
        if (existingRecord) { deleteRecordIds.push(existingRecord.id); changedCells += 1; touched.add(code); }
        continue;
      }
      if (existingRecord?.calculatedTotal === parsed.value) continue;
      records.push({ submissionCode: code, submissionTitle: match.submission.title_th, submissionOrder: match.order, judgeKey: item.profile.judgeKey, judgeName: formatPresentationJudge(item.profile), itemScores: {}, totalScore: parsed.value, note: "Excel total score import", submittedByEmail: "" });
      changedCells += 1;
      touched.add(code);
    }
  });
  return { records, deleteRecordIds: [...new Set(deleteRecordIds)], errors, changedCells, touchedSubmissions: touched.size } satisfies PresentationScoreImportResult;
}

function findHeader(headers: string[], candidates: string[]) {
  return headers.findIndex((header) => candidates.map(normalizeHeader).some((candidate) => header === candidate || header.includes(candidate)));
}
function parseScore(value: string): { value: number | null; error: string | null } {
  const text = value.trim();
  if (!text) return { value: null, error: null };
  const score = Number(text.replace(/,/g, ""));
  if (!Number.isFinite(score) || score < 0 || score > 100) return { value: null, error: "คะแนนต้องเป็นตัวเลขระหว่าง 0-100" };
  return { value: Math.round(score * 100) / 100, error: null };
}
function scoreText(value: number | null | undefined) { return typeof value === "number" && Number.isFinite(value) ? String(value) : ""; }
function normalizeCell(value: string) { return String(value ?? "").replace(/^\uFEFF/, "").replace(/\s+/g, " ").trim(); }
function normalizeHeader(value: string) { return normalizeCell(value).toLowerCase(); }

