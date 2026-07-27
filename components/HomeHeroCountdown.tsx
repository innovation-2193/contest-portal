"use client";

import { useEffect, useMemo, useState } from "react";

type HomeTimeLeft = {
  total: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
};

function getHomeTimeLeft(targetTime: number, now = Date.now()): HomeTimeLeft {
  const total = Math.max(0, targetTime - now);
  const totalDays = Math.floor(total / 86400000);
  const days = totalDays;
  const hours = Math.floor((total % 86400000) / 3600000);
  const minutes = Math.floor((total % 3600000) / 60000);
  const seconds = Math.floor((total % 60000) / 1000);
  return { total, days, hours, minutes, seconds };
}

export function HomeHeroCountdown({
  target,
  initialNow,
  title,
  note,
}: {
  target: string;
  initialNow: number;
  title?: string;
  note?: string;
}) {
  const targetDate = useMemo(() => new Date(target), [target]);
  const targetTime = targetDate.getTime();
  const [timeLeft, setTimeLeft] = useState(() => getHomeTimeLeft(targetTime, initialNow));

  useEffect(() => {
    if (Number.isNaN(targetTime) || targetTime <= Date.now()) return;
    const timer = window.setInterval(() => {
      setTimeLeft(getHomeTimeLeft(targetTime));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [targetTime]);

  if (Number.isNaN(targetTime) || timeLeft.total <= 0) return null;

  const items = [
    ["วัน", timeLeft.days],
    ["ชั่วโมง", timeLeft.hours],
    ["นาที", timeLeft.minutes],
    ["วินาที", timeLeft.seconds],
  ] as const;

  return <div className="home-countdown-wrap" aria-label="เวลานับถอยหลัง">
    {title && <p className="home-countdown-title">{title}</p>}
    <div className="home-countdown">
      {items.map(([label, value], index) => <div className={index === items.length - 1 ? "highlight" : ""} key={label}>
        <strong key={`${label}-${value}`}>{String(value).padStart(2, "0")}</strong>
        <span>{label}</span>
      </div>)}
    </div>
    {note && <p className="home-countdown-note">{note}</p>}
  </div>;
}
