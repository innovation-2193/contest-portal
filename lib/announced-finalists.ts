import type { SubmissionApplicantExportRow, SubmissionListItem, WinnerRecord } from "./admin-store";
import type { CompetitorSource } from "./participant-type-breakdown";

export function buildAnnouncedFinalistSources(
  winners: WinnerRecord[],
  submissions: SubmissionListItem[],
  applicantRows?: SubmissionApplicantExportRow[],
): CompetitorSource[] {
  const submissionsByCode = new Map(submissions.map((submission) => [submission.submission_code, submission]));
  const applicantsByCode = new Map<string, SubmissionApplicantExportRow[]>();
  for (const applicant of applicantRows ?? []) {
    const rows = applicantsByCode.get(applicant.submission_code) ?? [];
    rows.push(applicant);
    applicantsByCode.set(applicant.submission_code, rows);
  }

  return winners
    .filter((winner) => winner.published)
    .slice(0, 10)
    .flatMap((winner): CompetitorSource[] => {
      const submission = winner.submissionCode ? submissionsByCode.get(winner.submissionCode) : undefined;
      const submissionCode = submission?.submission_code ?? winner.submissionCode ?? winner.id;
      const applicants = applicantsByCode.get(submissionCode) ?? [];
      if (applicants.length) {
        return applicants
          .sort((left, right) => left.member_order - right.member_order)
          .map((applicant) => ({
            submission_code: applicant.submission_code,
            member_order: applicant.member_order,
            title_th: submission?.title_th ?? applicant.title_th,
            review_total_score: submission?.review_total_score ?? null,
            email: applicant.email,
            title: applicant.title,
            first_name: applicant.first_name,
            last_name: applicant.last_name,
            position: applicant.position,
            division: applicant.division,
            bureau: applicant.bureau,
          }));
      }
      if (submission) return [submission];

      return [{
        submission_code: submissionCode,
        title_th: winner.projectTitle,
        review_total_score: null,
        email: "",
        title: "",
        first_name: winner.ownerName,
        last_name: "",
        position: "",
        division: winner.division,
        bureau: "",
      }];
    });
}
