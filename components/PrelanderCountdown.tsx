"use client";

import { useEffect, useMemo, useState } from "react";

type TimeLeft = {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
};

function getTimeLeft(target: Date, now = Date.now()): TimeLeft {
  const remaining = Math.max(0, target.getTime() - now);
  const days = Math.floor(remaining / 86400000);
  const hours = Math.floor((remaining % 86400000) / 3600000);
  const minutes = Math.floor((remaining % 3600000) / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);
  return { days, hours, minutes, seconds };
}

export function PrelanderCountdown({ target, initialNow }: { target: string; initialNow: number }) {
  const targetDate = useMemo(() => new Date(target), [target]);
  const [timeLeft, setTimeLeft] = useState(() => getTimeLeft(targetDate, initialNow));

  useEffect(() => {
    const timer = window.setInterval(() => setTimeLeft(getTimeLeft(targetDate)), 1000);
    return () => window.clearInterval(timer);
  }, [targetDate]);

  const items = [
    ["วัน", timeLeft.days],
    ["ชั่วโมง", timeLeft.hours],
    ["นาที", timeLeft.minutes],
    ["วินาที", timeLeft.seconds],
  ];

  return <div className="prelander-countdown" aria-label="เวลานับถอยหลัง">
    {items.map(([label, value], index) => <div className={index === 3 ? "highlight" : ""} key={label}>
      <strong>{String(value).padStart(2, "0")}</strong>
      <span>{label}</span>
    </div>)}
  </div>;
}
