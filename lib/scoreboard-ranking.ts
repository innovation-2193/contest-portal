export type ScoreboardSubmission = {
  review_total_score: number | null | undefined;
  submitted_at: string | Date;
  submission_code?: string;
};

export function compareScoreboardSubmissions<T extends ScoreboardSubmission>(left: T, right: T) {
  const scoreDiff = Number(right.review_total_score ?? Number.NEGATIVE_INFINITY) - Number(left.review_total_score ?? Number.NEGATIVE_INFINITY);
  if (scoreDiff !== 0) return scoreDiff;

  // Tie-break by the applicant's contest submission time, not the admin review submission time.
  const contestSubmittedDiff = submittedTimestamp(left.submitted_at) - submittedTimestamp(right.submitted_at);
  if (contestSubmittedDiff !== 0) return contestSubmittedDiff;

  return String(left.submission_code ?? "").localeCompare(String(right.submission_code ?? ""));
}

export function sortScoreboardSubmissions<T extends ScoreboardSubmission>(submissions: T[]) {
  return submissions
    .filter((item) => item.review_total_score !== null && item.review_total_score !== undefined)
    .sort(compareScoreboardSubmissions);
}

function submittedTimestamp(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  const time = date.getTime();
  return Number.isNaN(time) ? Number.MAX_SAFE_INTEGER : time;
}
