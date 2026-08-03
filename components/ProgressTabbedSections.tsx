"use client";

import { useState, type ReactNode } from "react";
import { Trophy, UsersRound } from "lucide-react";

type ProgressView = "scoreboard" | "reviewers";

export function ProgressTabbedSections({
  initialView = "scoreboard",
  scoreboard,
  reviewers,
}: {
  initialView?: ProgressView;
  scoreboard: ReactNode;
  reviewers: ReactNode;
}) {
  const [activeView, setActiveView] = useState<ProgressView>(initialView);
  return <>
    <nav className="progress1-tab-switcher" aria-label="สลับข้อมูลความคืบหน้า">
      <button type="button" className={activeView === "scoreboard" ? "active" : ""} aria-pressed={activeView === "scoreboard"} onClick={() => setActiveView("scoreboard")}><Trophy/>Score Board คะแนน Top 10</button>
      <button type="button" className={activeView === "reviewers" ? "active" : ""} aria-pressed={activeView === "reviewers"} onClick={() => setActiveView("reviewers")}><UsersRound/>รายชื่อผู้ตรวจเอกสาร</button>
    </nav>
    <div hidden={activeView !== "scoreboard"}>{scoreboard}</div>
    <div hidden={activeView !== "reviewers"}>{reviewers}</div>
  </>;
}
