"use client";

import { useId, useState, type KeyboardEvent } from "react";

export type CriteriaRound = {
  title: string;
  total: string;
  note: string;
  items: [string, number][];
};

export function CriteriaToggle({ rounds }: { rounds: CriteriaRound[] }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const tabsId = useId();
  const activeRound = rounds[activeIndex] ?? rounds[0];

  const selectWithKeyboard = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const targetIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? rounds.length - 1
        : (index + (event.key === "ArrowRight" ? 1 : -1) + rounds.length) % rounds.length;
    setActiveIndex(targetIndex);
    const tabs = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("[role='tab']");
    tabs?.[targetIndex]?.focus();
  };

  return (
    <div className="criteria-toggle">
      <div className="criteria-tabs" role="tablist" aria-label="เลือกเกณฑ์การตัดสิน">
        {rounds.map((round, index) => (
          <button
            key={round.title}
            type="button"
            role="tab"
            aria-selected={activeIndex === index}
            aria-controls={`${tabsId}-panel`}
            id={`${tabsId}-tab-${index}`}
            tabIndex={activeIndex === index ? 0 : -1}
            className={activeIndex === index ? "active" : ""}
            onClick={() => setActiveIndex(index)}
            onKeyDown={(event) => selectWithKeyboard(event, index)}
          >
            <span>รอบที่ {index + 1}</span>
            <b>{index === 0 ? "ประเมินเอกสาร" : "รอบนำเสนอ"}</b>
          </button>
        ))}
      </div>
      <section className="criteria-round" role="tabpanel" id={`${tabsId}-panel`} aria-labelledby={`${tabsId}-tab-${activeIndex}`}>
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
