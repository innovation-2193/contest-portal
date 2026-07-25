"use client";

import { useId, useState } from "react";
import { ArrowRight } from "lucide-react";

type FaqItem = {
  question: string;
  answer: string[];
};

export function FaqAccordion({ items }: { items: FaqItem[] }) {
  const accordionId = useId();
  const [openItems, setOpenItems] = useState<Set<number>>(() => new Set());

  const toggleItem = (index: number) => {
    setOpenItems((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  return <div className="faq-items">
    {items.map((item, index) => {
      const open = openItems.has(index);
      const answerId = `${accordionId}-answer-${index}`;
      return <article className={open ? "faq-item is-open" : "faq-item"} key={item.question}>
        <button
          className="faq-question"
          type="button"
          aria-expanded={open}
          aria-controls={answerId}
          onClick={() => toggleItem(index)}
        >
          <span>{item.question}</span>
          <i aria-hidden="true"><ArrowRight/></i>
        </button>
        <div className="faq-answer" id={answerId} role="region" aria-label={item.question}>
          <div className="faq-answer-content">
            {item.answer.map((line) => <p key={line}>{line}</p>)}
          </div>
        </div>
      </article>;
    })}
  </div>;
}
