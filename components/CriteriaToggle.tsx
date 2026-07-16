"use client";

import { useState } from "react";

export type CriteriaRound = {
  title: string;
  total: string;
  note: string;
  items: [string, number][];
};

export function CriteriaToggle({ rounds }: { rounds: CriteriaRound[] }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const activeRound = rounds[activeIndex] ?? rounds[0];

  return (
    <div className="criteria-toggle">
      <div className="criteria-tabs" role="tablist" aria-label="เลือกเกณฑ์การตัดสิน">
        {rounds.map((round, index) => (
          <button
            key={round.title}
            type="button"
            role="tab"
            aria-selected={activeIndex === index}
            className={activeIndex === index ? "active" : ""}
            onClick={() => setActiveIndex(index)}
          >
            <span>รอบที่ {index + 1}</span>
            <b>{index === 0 ? "ประเมินเอกสาร" : "รอบนำเสนอ"}</b>
          </button>
        ))}
      </div>
      <section className="criteria-round" role="tabpanel">
        <header>
          <h4>{activeRound.title}</h4>
          <b>คะแนนเต็ม {activeRound.total}</b>
        </header>
        <span>เกณฑ์การประเมิน</span>
        {activeRound.items.map(([item, score]) => (
          <p className="score" key={item}>
            <span>{item}</span>
            <b>{score} คะแนน</b>
          </p>
        ))}
        <p className="criteria-note">{activeRound.note}</p>
      </section>
    </div>
  );
}
