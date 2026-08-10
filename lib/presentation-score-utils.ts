import type { SubmissionListItem, WinnerRecord } from "./admin-store";

export function selectPresentationSubmissions(submissions: SubmissionListItem[], winners: WinnerRecord[]) {
  const byCode = new Map(submissions.map((submission) => [submission.submission_code, submission]));
  const byFallback = new Map(submissions.map((submission) => [submissionKey(submission.title_th, ownerName(submission), divisionName(submission)), submission]));
  const selected: SubmissionListItem[] = [];
  const selectedCodes = new Set<string>();
  for (const winner of winners) {
    const submission = (winner.submissionCode ? byCode.get(winner.submissionCode) : null)
      ?? byFallback.get(submissionKey(winner.projectTitle, winner.ownerName, winner.division));
    if (!submission || selectedCodes.has(submission.submission_code)) continue;
    selectedCodes.add(submission.submission_code);
    selected.push(submission);
  }
  return selected;
}

function ownerName(submission: SubmissionListItem) {
  return `${submission.first_name} ${submission.last_name}`.replace(/\s+/g, " ").trim();
}

function divisionName(submission: SubmissionListItem) {
  return [submission.division, submission.bureau].filter(Boolean).join(" / ");
}

function submissionKey(title: string, owner: string, division: string) {
  return [title, owner, division].map((value) => String(value ?? "").replace(/\s+/g, " ").trim().toLowerCase()).join("|");
}

