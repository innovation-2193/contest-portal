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

      return {
        submission_code: winner.submissionCode ?? winner.id,
        title_th: winner.projectTitle,
        review_total_score: null,
        email: "",
        title: "",
        first_name: winner.ownerName,
        last_name: "",
        position: "",
        division: winner.division,
        bureau: "",
      };
    });
}
