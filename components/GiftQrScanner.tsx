"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Camera, CheckCircle2, Gift, Loader2, QrCode, X, XCircle } from "lucide-react";
import jsQR from "jsqr";

type GiftResult = { registrationCode: string; name: string; claimedAt: string; claimedByEmail: string; wasAlreadyClaimed: boolean };

export function GiftQrScanner() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const loopRef = useRef<number | null>(null);
  const resumeTimerRef = useRef<number | null>(null);
  const scanningRef = useRef(false);
  const busyRef = useRef(false);
  const lastCodeRef = useRef("");
  const sameCodeBlockedRef = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const [cameraStatus, setCameraStatus] = useState("ยังไม่ได้เปิดกล้อง");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<GiftResult | null>(null);
  const [error, setError] = useState("");
  const [manualCode, setManualCode] = useState("");

  useEffect(() => () => {
    stopCamera();
    void audioContextRef.current?.close();
  }, []);

  async function startCamera() {
    setError("");
    try {
      prepareAudio(audioContextRef);
      stopCamera();
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      scanningRef.current = true;
      setCameraStatus("กำลังสแกน QR Code รับของชำร่วย");
      scanLoop();
    } catch {
      setCameraStatus("เปิดกล้องไม่ได้ กรุณาอนุญาตสิทธิ์กล้องหรือกรอกรหัส QR เอง");
    }
  }

  function stopCamera() {
    scanningRef.current = false;
    if (loopRef.current) window.clearTimeout(loopRef.current);
    loopRef.current = null;
    if (resumeTimerRef.current) window.clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    lastCodeRef.current = "";
    sameCodeBlockedRef.current = false;
    if (videoRef.current) videoRef.current.srcObject = null;
  }

  function scanLoop() {
    if (!scanningRef.current || !videoRef.current || busyRef.current) return;
    const video = videoRef.current;
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth && video.videoHeight) {
      const canvas = canvasRef.current;
      const context = canvas?.getContext("2d", { willReadFrequently: true });
      if (canvas && context) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const data = context.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(data.data, canvas.width, canvas.height, { inversionAttempts: "attemptBoth" })?.data;
        if (code) {
          if (code === lastCodeRef.current && sameCodeBlockedRef.current) {
            loopRef.current = window.setTimeout(scanLoop, 300);
            return;
          }
          lastCodeRef.current = code;
          sameCodeBlockedRef.current = true;
          scanningRef.current = false;
          void submitCode(code);
          return;
        }
        sameCodeBlockedRef.current = false;
      }
    }
    loopRef.current = window.setTimeout(scanLoop, 300);
  }

  async function submitCode(code: string) {
    prepareAudio(audioContextRef);
    busyRef.current = true;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const response = await fetch("/api/admin/gift-claim", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
      const data = await response.json().catch(() => ({ error: "ระบบตอบกลับไม่ถูกต้อง" })) as GiftResult & { error?: string };
      if (!response.ok) throw new Error(data.error || "สแกน QR รับของชำร่วยไม่สำเร็จ");
      setResult(data);
      setCameraStatus(data.wasAlreadyClaimed ? "รับของชำร่วยไปแล้ว • พร้อมสแกนรายการถัดไป" : "รับของชำร่วยสำเร็จ • พร้อมสแกนรายการถัดไป");
      playGiftTone(audioContextRef, data.wasAlreadyClaimed ? "already" : "success");
      setManualCode("");
    } catch (claimError) {
      setError(claimError instanceof Error ? claimError.message : "สแกน QR รับของชำร่วยไม่สำเร็จ");
    } finally {
      busyRef.current = false;
      setBusy(false);
      if (streamRef.current) {
        resumeTimerRef.current = window.setTimeout(() => {
          resumeTimerRef.current = null;
          if (streamRef.current && !busyRef.current) {
            scanningRef.current = true;
            scanLoop();
          }
        }, 650);
      }
    }
  }

  function clearResult() {
    setResult(null);
    setError("");
    if (streamRef.current) {
      scanningRef.current = true;
      scanLoop();
    }
  }

  return <div className="gift-scanner-shell">
    <section className={["gift-scanner-camera", result ? (result.wasAlreadyClaimed ? "already-claimed" : "claimed") : ""].filter(Boolean).join(" ")}>
      <video ref={videoRef} playsInline muted />
      <canvas ref={canvasRef} hidden />
      <div className="scanner-frame"><span/><span/><span/><span/></div>
      {result && <div className={["gift-scan-overlay", result.wasAlreadyClaimed ? "already" : "success"].join(" ")} role="alert">
        {result.wasAlreadyClaimed ? <AlertTriangle/> : <CheckCircle2/>}
        <b>{result.wasAlreadyClaimed ? "รับของชำร่วยไปแล้ว" : "ได้รับของชำร่วยแล้ว"}</b>
        <span>{result.name}</span>
      </div>}
      <div className="gift-scanner-label"><Gift/>{cameraStatus}</div>
    </section>
    <div className="gift-scanner-controls">
      <button className="primary" type="button" onClick={startCamera}><Camera/>เปิดกล้องสแกน</button>
      <button className="secondary" type="button" onClick={stopCamera}><QrCode/>หยุดสแกน</button>
    </div>
    <form className="gift-manual-form" onSubmit={(event) => { event.preventDefault(); void submitCode(manualCode); }}>
      <label>กรอกรหัส QR ด้วยตนเอง (กรณีกล้องใช้งานไม่ได้)<input value={manualCode} onChange={(event) => setManualCode(event.target.value)} placeholder="GIFT-..." autoComplete="off"/></label>
      <button className="secondary" type="submit" disabled={busy || !manualCode.trim()}>{busy ? <Loader2/> : <QrCode/>}ตรวจสอบ QR</button>
    </form>
    {error && <div className="gift-scan-result error"><XCircle/><div><b>ไม่สามารถรับของชำร่วยได้</b><p>{error}</p></div></div>}
    {result && <div className={["gift-scan-result", result.wasAlreadyClaimed ? "already" : "success"].join(" ")} role="alert">
      {result.wasAlreadyClaimed ? <AlertTriangle/> : <CheckCircle2/>}
      <div><b>{result.wasAlreadyClaimed ? "รับของชำร่วยไปแล้ว" : "รับของชำร่วยสำเร็จ"}</b><p>{result.name} • {result.registrationCode}</p>{result.wasAlreadyClaimed && <small>รับไปแล้วเมื่อ {formatDate(result.claimedAt)}</small>}</div>
      <button type="button" onClick={clearResult} aria-label="ปิดผลลัพธ์"><X/></button>
    </div>}
  </div>;
}

function prepareAudio(contextRef: { current: AudioContext | null }) {
  const context = getAudioContext(contextRef);
  if (context?.state === "suspended") void context.resume();
}

function getAudioContext(contextRef: { current: AudioContext | null }) {
  if (typeof window === "undefined") return null;
  if (contextRef.current) return contextRef.current;
  const AudioContextConstructor = window.AudioContext;
  if (!AudioContextConstructor) return null;
  contextRef.current = new AudioContextConstructor();
  return contextRef.current;
}

function playGiftTone(contextRef: { current: AudioContext | null }, kind: "success" | "already") {
  const context = getAudioContext(contextRef);
  if (!context) return;
  const start = context.currentTime + 0.02;
  if (kind === "success") {
    playTone(context, start, 740, 0.12, "sine", 0.18);
    playTone(context, start + 0.11, 988, 0.18, "sine", 0.2);
    return;
  }
  playTone(context, start, 190, 0.18, "sawtooth", 0.24, 120);
  playTone(context, start + 0.17, 145, 0.24, "square", 0.2, 92);
}

function playTone(
  context: AudioContext,
  start: number,
  frequency: number,
  duration: number,
  type: OscillatorType,
  volume: number,
  endFrequency?: number,
) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  if (endFrequency) oscillator.frequency.exponentialRampToValueAtTime(endFrequency, start + duration);
  gain.gain.setValueAtTime(0.001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.03);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(new Date(value));
}
