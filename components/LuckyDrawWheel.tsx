"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { Gift, LockKeyhole, Mail, RotateCcw, ShieldCheck, Sparkles, Trophy } from "lucide-react";
import type { LuckyDrawCandidate } from "../lib/evaluation-store";

type LuckyWinner = {
  registrationCode: string;
  name: string;
  email: string;
  prize: number;
  drawnAt: string | null;
  drawnBy: string | null;
  notifiedAt: string | null;
};

export function LuckyDrawWheel({
  candidates,
  initialWinners,
  isSuperAdmin,
  resetOtpStatus,
}: {
  candidates: LuckyDrawCandidate[];
  initialWinners: LuckyWinner[];
  isSuperAdmin: boolean;
  resetOtpStatus?: string;
}) {
  const router = useRouter();
  const [available, setAvailable] = useState(candidates);
  const [winners, setWinners] = useState(initialWinners);
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [revealedWinner, setRevealedWinner] = useState<LuckyWinner | null>(null);
  const [error, setError] = useState("");
  const nextPrize = [1, 2, 3].find((prize) => !winners.some((winner) => winner.prize === prize)) ?? null;
  const wheelNames = useMemo(() => available.slice(0, 12), [available]);

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
      setRevealedWinner(payload.winner);
    } catch (drawError) {
      setError(drawError instanceof Error ? drawError.message : "ไม่สามารถจับฉลากได้");
    } finally {
      setSpinning(false);
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
          <span className="eyebrow">Live Lucky Draw</span>
          <h3>{nextPrize ? `ขณะนี้กำลังจับรางวัลที่ ${nextPrize}` : "จับฉลากครบแล้ว"}</h3>
          <p>ผู้มีสิทธิ์คงเหลือ <strong>{available.length.toLocaleString("th-TH")}</strong> คน ผลแต่ละรางวัลบันทึกได้เพียงครั้งเดียว</p>
          {isSuperAdmin ? (
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

      {isSuperAdmin && winners.length > 0 && (
        <section className="lucky-reset-panel">
          <div><RotateCcw /><span><b>Reset ผล Lucky Draw</b><small>ใช้เฉพาะเมื่อระบบผิดพลาด ต้องยืนยันด้วย OTP ของ Super Admin และระบบจะแจ้งผู้ได้รับรางวัลเดิมทุกคน</small></span></div>
          <div className="lucky-reset-actions">
            <form action="/api/admin/evaluations/lucky-draw/reset-otp" method="post">
              <button className="secondary" type="submit"><Mail />ส่ง OTP สำหรับ Reset</button>
            </form>
            {(resetOtpStatus === "sent" || resetOtpStatus === "failed") && (
              <form action="/api/admin/evaluations/lucky-draw/reset" method="post" className="lucky-reset-verify-form">
                <label>OTP 6 หลัก<input name="otp" inputMode="numeric" pattern="[0-9๐-๙ -]{6,20}" maxLength={20} autoComplete="one-time-code" required /></label>
                <button className="danger-btn" type="submit"><RotateCcw />ยืนยัน Reset ผล</button>
              </form>
            )}
          </div>
        </section>
      )}

      {revealedWinner && (
        <div className="lucky-winner-modal" role="dialog" aria-modal="true" aria-labelledby="lucky-winner-title">
          <div className="lucky-confetti" aria-hidden="true">{Array.from({ length: 36 }, (_, index) => <i key={index} />)}</div>
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
