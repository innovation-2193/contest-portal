"use client";

import { useId, useState, type KeyboardEvent } from "react";

export type CriteriaRound = {
  title: string;
  total: string;
  note: string;
  items: [string, number, string?][];
};

type CriteriaAward = {
  title: string;
  note: string;
  prizes: { code: string; title: string; detail: string }[];
};

export function CriteriaToggle({ rounds, award }: { rounds: CriteriaRound[]; award?: CriteriaAward }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const tabsId = useId();
  const activeRound = rounds[activeIndex] ?? rounds[0];
  const tabCount = rounds.length + (award ? 1 : 0);
  const isAwardTab = Boolean(award) && activeIndex === rounds.length;

  const selectWithKeyboard = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const targetIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? tabCount - 1
        : (index + (event.key === "ArrowRight" ? 1 : -1) + tabCount) % tabCount;
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
        {award && (
          <button
            type="button"
            role="tab"
            aria-selected={isAwardTab}
            aria-controls={`${tabsId}-panel`}
            id={`${tabsId}-tab-${rounds.length}`}
            tabIndex={isAwardTab ? 0 : -1}
            className={isAwardTab ? "active" : ""}
            onClick={() => setActiveIndex(rounds.length)}
            onKeyDown={(event) => selectWithKeyboard(event, rounds.length)}
          >
            <span>รางวัล</span>
            <b>เงินรางวัล</b>
          </button>
        )}
      </div>
      <section className={`criteria-round${activeRound.items.some(([, , guidance]) => guidance) ? " criteria-round-detailed" : ""}`} role="tabpanel" id={`${tabsId}-panel`} aria-labelledby={`${tabsId}-tab-${activeIndex}`}>
        {isAwardTab && award ? (
          <>
            <header>
              <h4>{award.title}</h4>
              <b>รางวัลหลักและชมเชย</b>
            </header>
            <span>สรุปรางวัล</span>
            <div className="criteria-award-grid">
              {award.prizes.map((prize) => (
                <article key={prize.code} className="criteria-award-card">
                  <i>{prize.code}</i>
                  <div>
                    <b>{prize.title}</b>
                    <span>{prize.detail}</span>
                  </div>
                </article>
              ))}
            </div>
            <p className="criteria-note">{award.note}</p>
          </>
        ) : (
          <>
            <header>
              <h4>{activeRound.title}</h4>
              <b>คะแนนเต็ม {activeRound.total}</b>
            </header>
            <span>เกณฑ์การประเมิน</span>
            {activeRound.items.map(([item, score, guidance]) => (
              <p className="score" key={item}>
                <span>
                  {item}
                  {guidance && <small className="score-guidance"><b>แนวทางการพิจารณา</b>{guidance}</small>}
                </span>
                <b>{score} คะแนน</b>
              </p>
            ))}
            <p className="criteria-note">{activeRound.note}</p>
          </>
        )}
      </section>
    </div>
  );
}
