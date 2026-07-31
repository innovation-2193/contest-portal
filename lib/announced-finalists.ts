import type { SubmissionListItem, WinnerRecord } from "./admin-store";
import type { CompetitorSource } from "./participant-type-breakdown";

export function buildAnnouncedFinalistSources(
  winners: WinnerRecord[],
  submissions: SubmissionListItem[],
): CompetitorSource[] {
  const submissionsByCode = new Map(submissions.map((submission) => [submission.submission_code, submission]));

  return winners
    .filter((winner) => winner.published)
    .slice(0, 10)
    .map((winner) => {
      const submission = winner.submissionCode ? submissionsByCode.get(winner.submissionCode) : undefined;
      if (submission) return submission;

      const ownerNameParts = winner.ownerName.trim().split(/\s+/).filter(Boolean);
      const firstName = ownerNameParts.shift() ?? winner.ownerName;
      const lastName = ownerNameParts.join(" ");

      return {
        submission_code: winner.submissionCode ?? winner.id,
        title_th: winner.projectTitle,
        review_total_score: null,
        email: "",
        first_name: firstName,
        last_name: lastName,
        position: "",
        division: winner.division,
        bureau: "",
      };
    });
}
