"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { Gift, LockKeyhole, Mail, RotateCcw, ShieldCheck, Sparkles, Trophy, Volume2, VolumeX } from "lucide-react";
import type { LuckyDrawCandidate } from "../lib/evaluation-store";
import { SecretInput } from "./SecretInput";

type LuckyWinner = {
  registrationCode: string;
  name: string;
  email: string;
  prize: number;
  drawnAt: string | null;
  drawnBy: string | null;
  notifiedAt: string | null;
};

const CONFETTI_COLORS = ["#f4d35e", "#fff0a8", "#51c7e8", "#68d5a6", "#f17c8e", "#ffffff"];
const CONFETTI_PIECES = Array.from({ length: 64 }, (_, index) => ({
  x: `${(index * 37 + 7) % 100}%`,
  delay: `${((index * 53) % 740) / 1000}s`,
  duration: `${2.3 + ((index * 29) % 110) / 100}s`,
  drift: `${((index * 47) % 180) - 90}px`,
  rotation: `${540 + ((index * 71) % 720)}deg`,
  color: CONFETTI_COLORS[index % CONFETTI_COLORS.length],
}));

export function LuckyDrawWheel({
  candidates,
  initialWinners,
  canRunLuckyDraw,
  resetOtpStatus,
  resetOtpAutoFill = "",
}: {
  candidates: LuckyDrawCandidate[];
  initialWinners: LuckyWinner[];
  canRunLuckyDraw: boolean;
  resetOtpStatus?: string;
  resetOtpAutoFill?: string;
}) {
  const router = useRouter();
  const [available, setAvailable] = useState(candidates);
  const [winners, setWinners] = useState(initialWinners);
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [revealedWinner, setRevealedWinner] = useState<LuckyWinner | null>(null);
  const [error, setError] = useState("");
  const [soundEnabled, setSoundEnabled] = useState(true);
  const audioContextRef = useRef<AudioContext | null>(null);
  const spinSoundTimersRef = useRef<number[]>([]);
  const nextPrize = [1, 2, 3].find((prize) => !winners.some((winner) => winner.prize === prize)) ?? null;
  const wheelNames = useMemo(() => available.slice(0, 12), [available]);

  useEffect(() => {
    setSoundEnabled(window.localStorage.getItem("lucky-draw-sound-enabled") !== "false");
    return () => {
      spinSoundTimersRef.current.forEach((timer) => window.clearTimeout(timer));
      spinSoundTimersRef.current = [];
      if (audioContextRef.current) {
        void audioContextRef.current.close();
        audioContextRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!revealedWinner) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setRevealedWinner(null);
        router.refresh();
      }
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [revealedWinner, router]);

  const draw = async () => {
    if (!nextPrize || spinning || !available.length) return;
    setError("");
    setRevealedWinner(null);
    setSpinning(true);
    setRotation((current) => current + 2160 + 180 + Math.floor(Math.random() * 280));
    const audioContext = soundEnabled ? getAudioContext(audioContextRef) : null;
    if (audioContext) {
      void audioContext.resume();
      scheduleSpinSound(audioContext, spinSoundTimersRef);
    }
    const startedAt = Date.now();
    try {
      const responsePromise = fetch("/api/admin/evaluations/lucky-draw", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prize: nextPrize }),
      });
      const response = await responsePromise;
      const payload = await response.json() as { winner?: LuckyWinner; error?: string };
      const remainingDelay = Math.max(0, 4200 - (Date.now() - startedAt));
      await new Promise((resolve) => window.setTimeout(resolve, remainingDelay));
      if (!response.ok || !payload.winner) throw new Error(payload.error || "ไม่สามารถจับฉลากได้");
      setWinners((current) => [...current, payload.winner!].sort((a, b) => a.prize - b.prize));
      setAvailable((current) => current.filter((item) => item.registrationCode !== payload.winner!.registrationCode));
      stopSpinSound(spinSoundTimersRef);
      if (audioContext && soundEnabled) playWinnerSound(audioContext);
      setRevealedWinner(payload.winner);
    } catch (drawError) {
      setError(drawError instanceof Error ? drawError.message : "ไม่สามารถจับฉลากได้");
    } finally {
      stopSpinSound(spinSoundTimersRef);
      setSpinning(false);
    }
  };

  const toggleSound = () => {
    const nextValue = !soundEnabled;
    setSoundEnabled(nextValue);
    window.localStorage.setItem("lucky-draw-sound-enabled", String(nextValue));
    if (!nextValue) {
      stopSpinSound(spinSoundTimersRef);
      if (audioContextRef.current) void audioContextRef.current.suspend();
    } else {
      const audioContext = getAudioContext(audioContextRef);
      if (audioContext) void audioContext.resume();
    }
  };

  return (
    <div className="lucky-draw-console">
      <div className="lucky-prize-progress" aria-label="สถานะรางวัล Lucky Draw">
        {[1, 2, 3].map((prize) => {
          const winner = winners.find((item) => item.prize === prize);
          const isCurrent = nextPrize === prize;
          return <div className={winner ? "complete" : isCurrent ? "current" : ""} key={prize}>
            <span>{winner ? <ShieldCheck /> : <Trophy />}</span>
            <small>รางวัลที่</small>
            <b>{prize}</b>
            <em>{winner ? "บันทึกผลแล้ว" : isCurrent ? "กำลังรอจับฉลาก" : "รอตามลำดับ"}</em>
          </div>;
        })}
      </div>

      <div className="lucky-wheel-layout">
        <div className={spinning ? "lucky-wheel-stage is-spinning" : "lucky-wheel-stage"}>
          <div className="lucky-wheel-pointer" aria-hidden="true" />
          <div className="lucky-wheel" style={{ "--wheel-rotation": `${rotation}deg`, "--wheel-label-rotation": `${-rotation}deg` } as CSSProperties}>
            <div className="lucky-wheel-labels">
              {wheelNames.map((candidate, index) => (
                <span
                  key={candidate.registrationCode}
                  style={{ "--label-index": index, "--label-count": Math.max(wheelNames.length, 1) } as CSSProperties}
                >
                  {candidate.name}
                </span>
              ))}
            </div>
            <div className="lucky-wheel-center"><Gift /><small>Lucky Draw</small></div>
          </div>
          {spinning && <div className="lucky-wheel-status"><Sparkles /><b>กำลังจับรางวัลที่ {nextPrize}</b><span>ระบบกำลังสุ่มและล็อกผลลงฐานข้อมูล</span></div>}
        </div>

        <aside className="lucky-draw-control">
          <div className="lucky-control-topline">
            <span className="eyebrow">Live Lucky Draw</span>
            <button
              className="lucky-sound-toggle"
              type="button"
              onClick={toggleSound}
              aria-label={soundEnabled ? "ปิดเสียง Lucky Draw" : "เปิดเสียง Lucky Draw"}
              aria-pressed={soundEnabled}
              title={soundEnabled ? "ปิดเสียง" : "เปิดเสียง"}
            >
              {soundEnabled ? <Volume2 /> : <VolumeX />}
            </button>
          </div>
          <h3>{nextPrize ? `ขณะนี้กำลังจับรางวัลที่ ${nextPrize}` : "จับฉลากครบแล้ว"}</h3>
          <p>ผู้มีสิทธิ์คงเหลือ <strong>{available.length.toLocaleString("th-TH")}</strong> คน ผลแต่ละรางวัลบันทึกได้เพียงครั้งเดียว</p>
          {canRunLuckyDraw ? (
            <button className="lucky-draw-button" type="button" onClick={draw} disabled={spinning || !nextPrize || !available.length}>
              {spinning ? <Sparkles /> : nextPrize ? <Gift /> : <LockKeyhole />}
              {spinning ? `กำลังสุ่มรางวัลที่ ${nextPrize}` : nextPrize ? `เริ่มจับรางวัลที่ ${nextPrize}` : "ผลถูกล็อกครบ 3 รางวัล"}
            </button>
          ) : (
            <div className="lucky-readonly-notice"><LockKeyhole />เฉพาะ Super Admin เท่านั้นที่เริ่มจับฉลากได้</div>
          )}
          {error && <div className="admin-login-alert">{error}</div>}
          <div className="lucky-draw-assurance">
            <span><ShieldCheck />บันทึกผู้กดและเวลาทุกรายการ</span>
            <span><LockKeyhole />ผลที่บันทึกแล้วแก้ไขไม่ได้</span>
            <span><Mail />ส่งอีเมลแจ้งผู้ได้รับรางวัลอัตโนมัติ</span>
          </div>
        </aside>
      </div>

      <div className="lucky-winner-list detail">
        {winners.length ? winners.map((winner) => <article key={`${winner.prize}-${winner.registrationCode}`}>
          <span>รางวัลที่ {winner.prize}</span>
          <b>{winner.name}</b>
          <small>{winner.registrationCode} • {winner.email || "-"}</small>
          <small>จับเมื่อ {formatAdminDate(winner.drawnAt)} • โดย {winner.drawnBy ?? "-"}</small>
          <small className={winner.notifiedAt ? "notified" : "pending"}>{winner.notifiedAt ? `ส่งอีเมลแล้ว ${formatAdminDate(winner.notifiedAt)}` : "กำลังรอส่งอีเมล"}</small>
        </article>) : <div className="participant-empty">ยังไม่ได้จับฉลากผู้โชคดี</div>}
      </div>

      {resetOtpStatus && resetOtpMessage(resetOtpStatus)}

      {canRunLuckyDraw && winners.length > 0 && (
        <section className="lucky-reset-panel">
          <div><RotateCcw /><span><b>Reset ผล Lucky Draw</b><small>ใช้เฉพาะเมื่อระบบผิดพลาด ต้องยืนยันด้วย OTP ของ Super Admin และระบบจะแจ้งผู้ได้รับรางวัลเดิมทุกคน</small></span></div>
          <div className="lucky-reset-actions">
            <form action="/api/admin/evaluations/lucky-draw/reset-otp" method="post">
              <button className="secondary" type="submit"><Mail />ส่ง OTP สำหรับ Reset</button>
            </form>
            {(resetOtpStatus === "sent" || resetOtpStatus === "failed") && (
              <form action="/api/admin/evaluations/lucky-draw/reset" method="post" className="lucky-reset-verify-form">
                <label>OTP 6 หลัก<SecretInput name="otp" inputMode="numeric" pattern="[0-9๐-๙ -]{6,20}" maxLength={20} autoComplete="one-time-code" defaultValue={resetOtpAutoFill} required /></label>
                <button className="danger-btn" type="submit"><RotateCcw />ยืนยัน Reset ผล</button>
              </form>
            )}
          </div>
        </section>
      )}

      {revealedWinner && (
        <div className="lucky-winner-modal" role="dialog" aria-modal="true" aria-labelledby="lucky-winner-title">
          <div className="lucky-confetti" aria-hidden="true">
            {CONFETTI_PIECES.map((piece, index) => (
              <i
                key={index}
                style={{
                  "--confetti-x": piece.x,
                  "--confetti-delay": piece.delay,
                  "--confetti-duration": piece.duration,
                  "--confetti-drift": piece.drift,
                  "--confetti-rotation": piece.rotation,
                  "--confetti-color": piece.color,
                } as CSSProperties}
              />
            ))}
          </div>
          <article>
            <span><Trophy /></span>
            <small>ผล Lucky Draw รางวัลที่ {revealedWinner.prize}</small>
            <h2 id="lucky-winner-title">{revealedWinner.name}</h2>
            <p>{revealedWinner.registrationCode}</p>
            <strong>บันทึกผลเรียบร้อยแล้ว</strong>
            <button type="button" onClick={() => {
              setRevealedWinner(null);
              router.refresh();
            }}>{nextPrize ? `ไปจับรางวัลที่ ${nextPrize}` : "ปิดและดูผลทั้งหมด"}</button>
          </article>
        </div>
      )}
    </div>
  );
}

function resetOtpMessage(status?: string) {
  if (status === "sent") return <div className="admin-login-alert success">ส่ง OTP ไปยังอีเมล Super Admin แล้ว รหัสมีอายุ 5 นาที</div>;
  if (status === "wait") return <div className="admin-login-alert">กรุณารอ 1 นาทีก่อนขอ OTP ใหม่</div>;
  if (status === "mail_failed") return <div className="admin-login-alert">ส่งอีเมล OTP ไม่สำเร็จ กรุณาตรวจสอบระบบอีเมล</div>;
  if (status === "failed") return <div className="admin-login-alert">OTP ไม่ถูกต้องหรือหมดอายุ กรุณาขอรหัสใหม่</div>;
  if (status === "reset_done") return <div className="admin-login-alert success">Reset ผลเรียบร้อย และแจ้งผู้ได้รับรางวัลเดิมแล้ว</div>;
  if (status === "reset_mail_failed") return <div className="admin-login-alert">Reset ผลแล้ว แต่มีอีเมลแจ้งยกเลิกบางรายการส่งไม่สำเร็จ กรุณาตรวจสอบระบบอีเมลและ Audit Log</div>;
  if (status === "empty") return <div className="admin-login-alert">ไม่มีผล Lucky Draw ที่ต้อง Reset</div>;
  if (status === "error") return <div className="admin-login-alert">Reset ผลไม่สำเร็จ กรุณาตรวจสอบระบบและลองใหม่</div>;
  return null;
}

function formatAdminDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(date);
}

function getAudioContext(audioContextRef: { current: AudioContext | null }) {
  if (typeof window === "undefined") return null;
  if (audioContextRef.current && audioContextRef.current.state !== "closed") return audioContextRef.current;
  const AudioContextConstructor = window.AudioContext
    ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextConstructor) return null;
  audioContextRef.current = new AudioContextConstructor();
  return audioContextRef.current;
}

function stopSpinSound(spinSoundTimersRef: { current: number[] }) {
  spinSoundTimersRef.current.forEach((timer) => window.clearTimeout(timer));
  spinSoundTimersRef.current = [];
}

function scheduleSpinSound(
  audioContext: AudioContext,
  spinSoundTimersRef: { current: number[] },
) {
  stopSpinSound(spinSoundTimersRef);
  let elapsed = 0;
  const spinDuration = 4050;
  while (elapsed < spinDuration) {
    const progress = elapsed / spinDuration;
    const timer = window.setTimeout(() => playWheelTick(audioContext, progress), elapsed);
    spinSoundTimersRef.current.push(timer);
    elapsed += 55 + (progress ** 2) * 205;
  }
}

function playWheelTick(audioContext: AudioContext, progress: number) {
  if (audioContext.state === "closed") return;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  const now = audioContext.currentTime;
  oscillator.type = "triangle";
  oscillator.frequency.setValueAtTime(920 - (progress * 390), now);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.045, now + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start(now);
  oscillator.stop(now + 0.055);
}

function playWinnerSound(audioContext: AudioContext) {
  if (audioContext.state === "closed") return;
  const notes = [
    { frequency: 523.25, start: 0, duration: 0.34 },
    { frequency: 659.25, start: 0.12, duration: 0.34 },
    { frequency: 783.99, start: 0.24, duration: 0.38 },
    { frequency: 1046.5, start: 0.4, duration: 0.72 },
  ];
  notes.forEach(({ frequency, start, duration }, index) => {
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const noteStart = audioContext.currentTime + start;
    oscillator.type = index === notes.length - 1 ? "sine" : "triangle";
    oscillator.frequency.setValueAtTime(frequency, noteStart);
    gain.gain.setValueAtTime(0.0001, noteStart);
    gain.gain.exponentialRampToValueAtTime(index === notes.length - 1 ? 0.075 : 0.055, noteStart + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, noteStart + duration);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(noteStart);
    oscillator.stop(noteStart + duration + 0.03);
  });
}
