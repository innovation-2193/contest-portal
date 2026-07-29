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
        <AnimatedCountdownNumber value={String(value).padStart(2, "0")} label={label}/>
        <span>{label}</span>
      </div>)}
    </div>
    {note && <p className="home-countdown-note">{note}</p>}
  </div>;
}

function AnimatedCountdownNumber({ value, label }: { value: string; label: string }) {
  const [displayValue, setDisplayValue] = useState(value);
  const [previousValue, setPreviousValue] = useState(value);
  const [isChanging, setIsChanging] = useState(false);

  useEffect(() => {
    if (value === displayValue) return;
    setPreviousValue(displayValue);
    setDisplayValue(value);
    setIsChanging(true);
    const timer = window.setTimeout(() => setIsChanging(false), 620);
    return () => window.clearTimeout(timer);
  }, [displayValue, value]);

  const digitLength = Math.max(displayValue.length, previousValue.length);
  const currentDigits = displayValue.padStart(digitLength, " ").split("");
  const previousDigits = previousValue.padStart(digitLength, " ").split("");

  return <strong className={`countdown-number ${isChanging ? "is-changing" : ""}`} aria-label={`${displayValue} ${label}`}>
    {currentDigits.map((digit, index) => {
      const previousDigit = previousDigits[index] ?? digit;
      const digitChanged = isChanging && digit !== previousDigit;
      return <span className={`countdown-digit ${digitChanged ? "is-changing" : ""}`} key={`${index}-${displayValue}-${previousValue}`} aria-hidden="true">
        <span className="countdown-digit-current">{digit}</span>
        {digitChanged && <span className="countdown-digit-previous">{previousDigit}</span>}
      </span>;
    })}
  </strong>;
}
