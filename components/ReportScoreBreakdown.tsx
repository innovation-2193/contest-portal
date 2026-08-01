import type { CSSProperties } from "react";
import type { SubmissionListItem } from "../lib/admin-store";
import { percent, progressScoreCriteria } from "../lib/progress-review";

type ReportScoreSubmission = Pick<
  SubmissionListItem,
  | "review_submitted_at"
  | "review_total_score"
  | "review_rules_score"
  | "review_problem_score"
  | "review_innovation_score"
  | "review_evidence_score"
  | "review_impact_score"
>;

export function hasReportScore(item: ReportScoreSubmission) {
  return Boolean(item.review_submitted_at && item.review_total_score !== null && item.review_total_score !== undefined);
}

export function ReportScoreBreakdown({ item }: { item: ReportScoreSubmission }) {
  if (!hasReportScore(item)) return null;

  return <div className="report-score-breakdown" aria-label="คะแนนรายด้าน">
    <div className="report-score-total">
      <span>คะแนนรวม</span>
      <b>{item.review_total_score ?? "-"} / 100</b>
    </div>
    <div className="report-score-criteria">
      {progressScoreCriteria.map((criterion) => {
        const score = item[criterion.key];
        const value = typeof score === "number" ? score : null;
        return <article key={criterion.key}>
          <span>{criterion.label}</span>
          <b>{value ?? "-"} / {criterion.max}</b>
          <i aria-hidden="true"><span style={{ width: `${percent(value ?? 0, criterion.max)}%` } as CSSProperties}/></i>
        </article>;
      })}
    </div>
  </div>;
}
