"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, CheckCircle2, Loader2, QrCode, XCircle } from "lucide-react";
import jsQR from "jsqr";

type ScanResult = {
  registrationCode: string;
  name: string;
  phone: string;
  position: string;
  division: string;
  bureau: string;
  status: string;
  checkedInAt?: string | null;
};

export function AdminQrScanner() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanningRef = useRef(false);
  const loopRef = useRef<number | null>(null);
  const [manualCode, setManualCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [cameraStatus, setCameraStatus] = useState("ยังไม่ได้เปิดกล้อง");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState("");

  useEffect(() => () => stopCamera(), []);

  async function startCamera() {
    setError("");
    setResult(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraStatus("อุปกรณ์นี้ไม่รองรับกล้องผ่านเว็บ กรุณากรอกรหัสลงทะเบียนแทน");
      return;
    }

    try {
      stopCamera();
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      scanningRef.current = true;
      const BarcodeDetectorCtor = (window as unknown as { BarcodeDetector?: new (options: { formats: string[] }) => { detect(video: HTMLVideoElement): Promise<Array<{ rawValue: string }>> } }).BarcodeDetector;
      const detector = BarcodeDetectorCtor ? new BarcodeDetectorCtor({ formats: ["qr_code"] }) : null;
      setCameraStatus(detector ? "กำลังสแกน QR Code ด้วยระบบของเบราว์เซอร์" : "กำลังสแกน QR Code ด้วยระบบสำรอง");
      scanLoop(detector);
    } catch (cameraError) {
      const name = cameraError instanceof DOMException ? cameraError.name : "";
      const reason = name === "NotAllowedError"
        ? "กรุณาอนุญาตสิทธิ์กล้องในเบราว์เซอร์"
        : window.isSecureContext
          ? "กรุณาตรวจสอบว่ามีกล้องและไม่ได้ถูกแอปอื่นใช้งานอยู่"
          : "การเปิดกล้องต้องใช้ localhost หรือ HTTPS";
      setCameraStatus(`เปิดกล้องไม่ได้: ${reason}`);
    }
  }

  function stopCamera() {
    scanningRef.current = false;
    if (loopRef.current) window.clearTimeout(loopRef.current);
    loopRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }

  async function scanLoop(detector: { detect(video: HTMLVideoElement): Promise<Array<{ rawValue: string }>> } | null) {
    if (!scanningRef.current || !videoRef.current || busy) return;
    try {
      const code = await readQrCode(videoRef.current, detector);
      if (code) {
        scanningRef.current = false;
        await submitCode(code);
        loopRef.current = window.setTimeout(() => {
          scanningRef.current = true;
          scanLoop(detector);
        }, 1800);
        return;
      }
    } catch {
      setCameraStatus("กำลังพยายามอ่าน QR Code");
    }
    loopRef.current = window.setTimeout(() => scanLoop(detector), 300);
  }

  async function readQrCode(video: HTMLVideoElement, detector: { detect(video: HTMLVideoElement): Promise<Array<{ rawValue: string }>> } | null) {
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return "";
    if (detector) {
      const codes = await detector.detect(video);
      return codes[0]?.rawValue ?? "";
    }
    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!width || !height) return "";
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d", { willReadFrequently: true });
    if (!canvas || !context) return "";
    canvas.width = width;
    canvas.height = height;
    context.drawImage(video, 0, 0, width, height);
    const imageData = context.getImageData(0, 0, width, height);
    return jsQR(imageData.data, width, height, { inversionAttempts: "attemptBoth" })?.data ?? "";
  }

  async function submitCode(code: string) {
    const cleanedCode = code.trim().toUpperCase();
    if (!cleanedCode) {
      setError("กรุณากรอกรหัสลงทะเบียนก่อนเช็คอิน");
      return;
    }
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const response = await fetch("/api/admin/check-in", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: cleanedCode }),
      });
      const data = await response.json().catch(() => ({ error: "ระบบตอบกลับไม่ถูกต้อง" })) as ScanResult & { error?: string };
      if (!response.ok) {
        if (response.status === 401) throw new Error("เซสชันแอดมินหมดอายุ กรุณาเข้าสู่ระบบหลังบ้านใหม่");
        throw new Error(data.error || "เช็คอินไม่สำเร็จ");
      }
      setResult(data);
      setManualCode(data.registrationCode);
    } catch (scanError) {
      const message = scanError instanceof TypeError
        ? "เชื่อมต่อระบบเช็คอินไม่ได้ กรุณาตรวจสอบว่าเว็บรันอยู่และลองใหม่อีกครั้ง"
        : scanError instanceof Error
          ? scanError.message
          : "เช็คอินไม่สำเร็จ";
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  return <div className="scanner-shell">
    <section className={result ? "scanner-camera checked-in" : "scanner-camera"}>
      <video ref={videoRef} playsInline muted />
      <canvas ref={canvasRef} hidden />
      <div className="scanner-frame"><span/><span/><span/><span/></div>
      {result && <div className="scanner-success-overlay">
        <CheckCircle2/>
        <b>เช็คอินแล้ว</b>
        <span>{result.registrationCode}</span>
      </div>}
      <div className="scanner-camera-label">{result ? <CheckCircle2/> : <QrCode/>}{result ? "เช็คอินสำเร็จแล้ว พร้อมสแกนคนถัดไป" : "วาง QR Code ให้อยู่ในกรอบ"}</div>
    </section>
    <section className="scanner-controls">
      <div className="scanner-control-head">
        <span className="eyebrow">QR Check-in</span>
        <h2>สแกน QR Code ผู้เข้าร่วมงาน</h2>
        <p>{cameraStatus}</p>
      </div>
      {result && <div className="scan-success-hero" role="status" aria-live="polite">
        <div className="scan-success-mark"><CheckCircle2/></div>
        <div className="scan-success-copy">
          <span>CHECKED IN</span>
          <h3>เช็คอินเรียบร้อยแล้ว</h3>
          <p>{result.name}</p>
          <dl>
            <div><dt>รหัสลงทะเบียน</dt><dd>{result.registrationCode}</dd></div>
            <div><dt>เวลาเช็คอิน</dt><dd>{formatScanDate(result.checkedInAt)}</dd></div>
          </dl>
        </div>
      </div>}
      <div className="scanner-buttons">
        <button className="primary" type="button" onClick={startCamera}><Camera/>เปิดกล้อง</button>
        <button className="secondary" type="button" onClick={stopCamera}><QrCode/>หยุดสแกน</button>
      </div>
      <form className="scanner-manual" onSubmit={(event) => { event.preventDefault(); void submitCode(manualCode); }}>
        <label>กรอกรหัสลงทะเบียนด้วยตนเอง
          <input value={manualCode} onChange={(event) => setManualCode(event.target.value.toUpperCase())} placeholder="REG-2569-XXXXXXXX" autoComplete="off" />
        </label>
        <button className="primary" type="submit" disabled={busy}>{busy ? <Loader2/> : <CheckCircle2/>}เช็คอิน</button>
      </form>
      <div className="scanner-help">
        <b>วิธีใช้งาน</b>
        <p>เปิดกล้องแล้วนำ QR Code จากอีเมลหรือไฟล์ PDF มาไว้ในกรอบ หากกล้องใช้ไม่ได้ให้กรอกรหัส REG ด้วยตนเอง</p>
      </div>
      {result && <div className="scan-result success"><CheckCircle2/><div><b>รายละเอียดผู้เข้าร่วมงาน</b><p>{result.phone || "-"} • {result.position || "-"}</p><small>{result.division || "-"} / {result.bureau || "-"}</small></div></div>}
      {error && <div className="scan-result error"><XCircle/><div><b>ไม่สามารถเช็คอินได้</b><p>{error}</p></div></div>}
    </section>
  </div>;
}

function formatScanDate(value?: string | null) {
  if (!value) return "เมื่อสักครู่";
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(new Date(value));
}
