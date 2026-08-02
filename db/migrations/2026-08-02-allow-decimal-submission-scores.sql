ALTER TABLE submissions
  MODIFY review_rules_score DECIMAL(5,2) UNSIGNED NULL,
  MODIFY review_problem_score DECIMAL(5,2) UNSIGNED NULL,
  MODIFY review_innovation_score DECIMAL(5,2) UNSIGNED NULL,
  MODIFY review_evidence_score DECIMAL(5,2) UNSIGNED NULL,
  MODIFY review_impact_score DECIMAL(5,2) UNSIGNED NULL,
  MODIFY review_total_score DECIMAL(5,2) UNSIGNED NULL;
