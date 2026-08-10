import type { SubmissionListItem, WinnerRecord } from "./admin-store";

export function selectPresentationSubmissions(submissions: SubmissionListItem[], winners: WinnerRecord[]) {
  const byCode = new Map(submissions.map((submission) => [normalizeCode(submission.submission_code), submission]));
  const byFallback = new Map<string, SubmissionListItem>();
  submissions.forEach((submission) => {
    ownerNames(submission).forEach((owner) => {
      byFallback.set(submissionKey(submission.title_th, owner, divisionName(submission)), submission);
    });
  });
  const selected: SubmissionListItem[] = [];
  const selectedCodes = new Set<string>();
  for (const winner of winners) {
    const submission = (winner.submissionCode ? byCode.get(normalizeCode(winner.submissionCode)) : null)
      ?? byFallback.get(submissionKey(winner.projectTitle, winner.ownerName, winner.division));
    if (!submission || selectedCodes.has(submission.submission_code)) continue;
    selectedCodes.add(submission.submission_code);
    selected.push(submission);
  }
  return selected;
}

function ownerNames(submission: SubmissionListItem) {
  const names = [`${submission.first_name} ${submission.last_name}`];
  if (submission.team_name) names.push(`ทีม ${submission.team_name}`, submission.team_name);
  return [...new Set(names.map((value) => value.replace(/\s+/g, " ").trim()).filter(Boolean))];
}

function divisionName(submission: SubmissionListItem) {
  return [submission.division, submission.bureau].filter(Boolean).join(" / ");
}

function submissionKey(title: string, owner: string, division: string) {
  return [title, owner, division].map((value) => String(value ?? "").replace(/\s+/g, " ").trim().toLowerCase()).join("|");
}

function normalizeCode(value: string) {
  return String(value ?? "").replace(/\s+/g, "").trim().toUpperCase();
}
