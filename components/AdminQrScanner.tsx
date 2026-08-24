"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Camera, CheckCircle2, Loader2, QrCode, RotateCcw, Search, UserCheck, X, XCircle } from "lucide-react";
import jsQR from "jsqr";
import { isFeaturedCheckInRole, participantRoleClass } from "../lib/participant-role-style";

type ParticipantRoleName = "VIP" | "Guest" | "Exhibitor" | "Competitor" | "Staff";

type ScanResult = {
  registrationCode: string;
  name: string;
  participantRole: ParticipantRoleName;
  phone: string;
  position: string;
  division: string;
  bureau: string;
  status: string;
  checkedInAt?: string | null;
  checkedInByEmail?: string | null;
  wasAlreadyCheckedIn?: boolean;
  teamSubmissionCode?: string;
  teamName?: string | null;
  teamCheckIns?: TeamCheckInResult[];
};

type TeamCheckInResult = {
  registrationCode: string;
  name: string;
  participantRole: ParticipantRoleName;
  status: string;
  checkedInAt?: string | null;
  wasAlreadyCheckedIn: boolean;
};

type ParticipantSearchResult = Omit<ScanResult, "checkedInByEmail" | "wasAlreadyCheckedIn">;

export type CheckInRoleCounts = Record<ParticipantRoleName, number>;

const scannerRoleOrder: ParticipantRoleName[] = ["VIP", "Guest", "Exhibitor", "Competitor", "Staff"];
const prosperityParticles = Array.from({ length: 22 }, (_, index) => index);

export function AdminQrScanner({ initialRoleCounts, registrationRoleCounts }: { initialRoleCounts: CheckInRoleCounts; registrationRoleCounts: CheckInRoleCounts }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<{ detect(video: HTMLVideoElement): Promise<Array<{ rawValue: string }>> } | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const scanningRef = useRef(false);
  const loopRef = useRef<number | null>(null);
  const resultScrollRef = useRef<HTMLDivElement | null>(null);
  const resultCloseRef = useRef<HTMLButtonElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [cameraStatus, setCameraStatus] = useState("ยังไม่ได้เปิดกล้อง");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<ParticipantSearchResult[]>([]);
  const [searchError, setSearchError] = useState("");
  const [roleCounts, setRoleCounts] = useState(initialRoleCounts);
  const [liveRegistrationRoleCounts, setLiveRegistrationRoleCounts] = useState(registrationRoleCounts);

  useEffect(() => () => {
    stopCamera();
    void audioContextRef.current?.close();
  }, []);

  useEffect(() => setRoleCounts(initialRoleCounts), [initialRoleCounts]);
  useEffect(() => setLiveRegistrationRoleCounts(registrationRoleCounts), [registrationRoleCounts]);

  useEffect(() => {
    let active = true;
    let refreshing = false;

    const refreshCounts = async () => {
      if (!active || refreshing || document.visibilityState === "hidden") return;
      refreshing = true;
      try {
        const response = await fetch("/api/admin/check-in/stats", {
          credentials: "include",
          cache: "no-store",
        });
        if (!response.ok) return;
        const data = await response.json() as { checkedIn?: CheckInRoleCounts; registered?: CheckInRoleCounts };
        if (!active || !data.checkedIn || !data.registered) return;
        setRoleCounts(data.checkedIn);
        setLiveRegistrationRoleCounts(data.registered);
      } catch {
        // Keep the last known counts while the scanner continues working.
      } finally {
        refreshing = false;
      }
    };

    const interval = window.setInterval(() => { void refreshCounts(); }, 10_000);
    void refreshCounts();
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!result) return;
    document.body.classList.add("scan-result-modal-open");
    resultScrollRef.current?.scrollTo({ top: 0, behavior: "auto" });
    resultCloseRef.current?.focus({ preventScroll: true });

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") clearResult();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.classList.remove("scan-result-modal-open");
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [result]);

  useEffect(() => {
    const query = searchQuery.replace(/\s+/g, " ").trim();
    if (query.length < 2) {
      setSearchResults([]);
      setSearchError("");
      setSearching(false);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setSearching(true);
      setSearchError("");
      try {
        const response = await fetch(`/api/admin/participants/search?q=${encodeURIComponent(query)}`, {
          credentials: "include",
          cache: "no-store",
          signal: controller.signal,
        });
        const data = await response.json().catch(() => ({ error: "ระบบค้นหาตอบกลับไม่ถูกต้อง" })) as { participants?: ParticipantSearchResult[]; error?: string };
        if (!response.ok) {
          if (response.status === 401) throw new Error("สถานะการเข้าสู่ระบบของผู้ดูแลระบบหมดอายุ กรุณาเข้าสู่ระบบหลังบ้านอีกครั้ง");
          throw new Error(data.error || "ค้นหาผู้เข้าร่วมไม่สำเร็จ");
        }
        setSearchResults(data.participants ?? []);
      } catch (searchIssue) {
        if ((searchIssue as DOMException).name === "AbortError") return;
        setSearchResults([]);
        setSearchError(searchIssue instanceof Error ? searchIssue.message : "ค้นหาผู้เข้าร่วมไม่สำเร็จ");
      } finally {
        setSearching(false);
      }
    }, 220);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [searchQuery]);

  async function startCamera() {
    setError("");
    setResult(null);
    void primeScanAudio();
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraStatus("อุปกรณ์นี้ไม่รองรับกล้องผ่านเว็บ กรุณาค้นหาชื่อผู้เข้าร่วมแล้วกดเช็คอิน");
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
      detectorRef.current = detector;
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
    detectorRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }

  async function scanLoop(detector: { detect(video: HTMLVideoElement): Promise<Array<{ rawValue: string }>> } | null) {
    if (!scanningRef.current || !videoRef.current || busy) return;
    try {
      const code = await readQrCode(videoRef.current, detector);
      if (code) {
        scanningRef.current = false;
        await submitCode(code);
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
    void primeScanAudio();
    const cleanedCode = code.trim().toUpperCase();
    if (!cleanedCode) {
      setError("ไม่พบรหัสลงทะเบียนสำหรับเช็คอิน");
      void playScanSound("error");
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
        if (response.status === 401) throw new Error("สถานะการเข้าสู่ระบบของผู้ดูแลระบบหมดอายุ กรุณาเข้าสู่ระบบหลังบ้านอีกครั้ง");
        throw new Error(data.error || "เช็คอินไม่สำเร็จ");
      }
      setResult(data);
      void playScanSound(data.wasAlreadyCheckedIn ? "error" : "success");
      updateRoleCounts(data);
      const autoCheckedCodes = new Map((data.teamCheckIns ?? []).map((item) => [item.registrationCode, item]));
      setSearchResults((items) => items.map((item) => item.registrationCode === data.registrationCode
        ? { ...item, status: data.status, checkedInAt: data.checkedInAt }
        : autoCheckedCodes.has(item.registrationCode)
          ? { ...item, status: "attended", checkedInAt: autoCheckedCodes.get(item.registrationCode)?.checkedInAt }
        : item));
    } catch (scanError) {
      const message = scanError instanceof TypeError
        ? "เชื่อมต่อระบบเช็คอินไม่ได้ กรุณาตรวจสอบว่าเว็บรันอยู่และลองใหม่อีกครั้ง"
        : scanError instanceof Error
          ? scanError.message
          : "เช็คอินไม่สำเร็จ";
      setError(message);
      void playScanSound("error");
    } finally {
      setBusy(false);
    }
  }

  function updateRoleCounts(data: ScanResult & { error?: string }) {
    const newlyCheckedRoles = [
      !data.wasAlreadyCheckedIn ? data.participantRole : null,
      ...(data.teamCheckIns ?? [])
        .filter((member) => !member.wasAlreadyCheckedIn)
        .map((member) => member.participantRole),
    ].filter((role): role is ParticipantRoleName => Boolean(role));
    if (!newlyCheckedRoles.length) return;
    setRoleCounts((current) => {
      const next = { ...current };
      for (const role of newlyCheckedRoles) next[role] += 1;
      return next;
    });
  }

  async function primeScanAudio() {
    try {
      const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextCtor) return null;
      const context = audioContextRef.current ?? new AudioContextCtor();
      audioContextRef.current = context;
      if (context.state === "suspended") await context.resume();
      return context;
    } catch {
      return null;
    }
  }

  async function playScanSound(type: "success" | "error") {
    try {
      const context = await primeScanAudio();
      if (!context) return;
      const now = context.currentTime;
      const master = context.createGain();
      const filter = context.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(type === "success" ? 4200 : 1800, now);
      filter.Q.setValueAtTime(0.7, now);
      master.gain.setValueAtTime(0.0001, now);
      master.gain.exponentialRampToValueAtTime(type === "success" ? 0.16 : 0.13, now + 0.018);
      master.gain.exponentialRampToValueAtTime(0.0001, now + (type === "success" ? 0.62 : 0.46));
      master.connect(filter);
      filter.connect(context.destination);

      const playTone = (frequency: number, start: number, duration: number, wave: OscillatorType = "sine", glideTo?: number) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = wave;
        oscillator.frequency.setValueAtTime(frequency, start);
        if (glideTo) oscillator.frequency.exponentialRampToValueAtTime(glideTo, start + duration * 0.82);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(1, start + 0.022);
        gain.gain.exponentialRampToValueAtTime(0.42, start + duration * 0.38);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
        oscillator.connect(gain);
        gain.connect(master);
        oscillator.start(start);
        oscillator.stop(start + duration + 0.03);
      };

      if (type === "success") {
        playTone(587.33, now, 0.22, "sine");
        playTone(783.99, now + 0.08, 0.24, "triangle");
        playTone(1174.66, now + 0.18, 0.34, "sine");
        playTone(1567.98, now + 0.21, 0.24, "sine");
      } else {
        playTone(392, now, 0.18, "triangle", 349.23);
        playTone(293.66, now + 0.12, 0.22, "triangle", 246.94);
        playTone(196, now + 0.22, 0.18, "sine", 174.61);
      }
    } catch {
      return;
    }
  }

  function clearResult() {
    setResult(null);
    setError("");
    if (streamRef.current && videoRef.current) {
      scanningRef.current = true;
      scanLoop(detectorRef.current);
    }
  }

  const resultRoleClass = participantRoleClass(result?.participantRole);
  const resultFeaturedClass = isFeaturedCheckInRole(result?.participantRole) ? "featured-role" : "";
  const totalCheckedIn = scannerRoleOrder.reduce((total, role) => total + roleCounts[role], 0);
  const totalRegistered = scannerRoleOrder.reduce((total, role) => total + liveRegistrationRoleCounts[role], 0);

  return <div className="scanner-shell">
    <section className={["scanner-camera", result ? "checked-in" : "", result ? resultRoleClass : "", result ? resultFeaturedClass : ""].filter(Boolean).join(" ")}>
      <video ref={videoRef} playsInline muted />
      <canvas ref={canvasRef} hidden />
      <div className="scanner-frame"><span/><span/><span/><span/></div>
      {result && <div className={["scanner-success-overlay", result.wasAlreadyCheckedIn ? "already" : "", resultRoleClass, resultFeaturedClass].filter(Boolean).join(" ")}>
        {result.wasAlreadyCheckedIn ? <AlertTriangle/> : <CheckCircle2/>}
        <b>{result.wasAlreadyCheckedIn ? "เช็คอินแล้ว" : "เช็คอินสำเร็จ"}</b>
        <span>{result.registrationCode}</span>
        <button type="button" onClick={clearResult} aria-label="ปิดผลลัพธ์การเช็คอิน"><X/></button>
      </div>}
      <div className="scanner-camera-label">{result ? result.wasAlreadyCheckedIn ? <AlertTriangle/> : <CheckCircle2/> : <QrCode/>}{result ? result.wasAlreadyCheckedIn ? "รายการนี้เคยเช็คอินแล้ว พร้อมสแกนคนถัดไป" : "เช็คอินเรียบร้อยแล้ว พร้อมสแกนคนถัดไป" : "วาง QR Code ให้อยู่ในกรอบ"}</div>
    </section>
    <section className="scanner-controls">
      <div className="scanner-control-head">
        <span className="eyebrow">QR Check-in</span>
        <h2>สแกน QR Code ผู้เข้าร่วมงาน</h2>
        <p>{cameraStatus}</p>
        <div className="scanner-total-count" aria-label="จำนวนผู้เข้าร่วมงานที่เช็คอินแล้วเทียบกับผู้ลงทะเบียนทั้งหมด">
          <b>{totalCheckedIn.toLocaleString("th-TH")} / {totalRegistered.toLocaleString("th-TH")}</b>
          <span>ผู้เข้าร่วมงานเช็คอินแล้ว / ผู้ลงทะเบียนทั้งหมด</span>
        </div>
      </div>
      <div className="scanner-role-counts" aria-label="จำนวนผู้เช็คอินแยกตาม Role">
        {scannerRoleOrder.map((role) => <article className={participantRoleClass(role)} key={role}>
          <span>{role}</span>
          <b>{roleCounts[role].toLocaleString("th-TH")} <i className="scanner-role-total">/ {liveRegistrationRoleCounts[role].toLocaleString("th-TH")}</i></b>
          <small>เช็คอินแล้ว / ผู้ลงทะเบียน</small>
        </article>)}
      </div>
      <div className="scanner-buttons">
        <button className="primary" type="button" onClick={startCamera}><Camera/>เปิดกล้อง</button>
        <button className="secondary" type="button" onClick={stopCamera}><QrCode/>หยุดสแกน</button>
      </div>
      <section className="scanner-live-search" aria-label="ค้นหาผู้เข้าร่วมเพื่อเช็คอิน">
        <label><span><Search/>ค้นหาชื่อผู้เข้าร่วมงาน</span>
          <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="พิมพ์ชื่อ นามสกุล เบอร์โทร รหัส REG หรือหน่วยงาน" autoComplete="off" />
        </label>
        <div className="scanner-search-status" role="status" aria-live="polite">
          {searching ? <><Loader2/>กำลังค้นหา</> : searchQuery.trim().length < 2 ? "พิมพ์อย่างน้อย 2 ตัวอักษรเพื่อค้นหา" : searchResults.length ? `พบ ${searchResults.length.toLocaleString("th-TH")} รายการ` : "ไม่พบผู้เข้าร่วมที่ตรงกับคำค้น"}
        </div>
        {searchError && <div className="scan-result error"><XCircle/><div><b>ค้นหาไม่ได้</b><p>{searchError}</p></div></div>}
        {searchResults.length > 0 && <div className="scanner-search-results">
          {searchResults.map((item) => {
            const cancelled = item.status === "cancelled";
            const attended = item.status === "attended";
            const roleClass = participantRoleClass(item.participantRole);
            return <article key={item.registrationCode} className={["scanner-search-item", attended ? "attended" : "", cancelled ? "cancelled" : "", roleClass].filter(Boolean).join(" ")}>
              <div>
                <b>{item.name}</b>
                <span>{item.registrationCode}</span>
                <i className={`status-pill role-pill ${roleClass}`}>{item.participantRole}</i>
                <small>{[item.position, item.division, item.bureau].filter(Boolean).join(" / ") || "-"}</small>
              </div>
              <em>{statusLabel(item.status)}</em>
              <button className={attended ? "secondary" : "primary"} type="button" disabled={busy || cancelled} onClick={() => { void submitCode(item.registrationCode); }}>
                {busy ? <Loader2/> : <UserCheck/>}{attended ? "เช็คอินซ้ำ" : "เช็คอิน"}
              </button>
            </article>;
          })}
        </div>}
      </section>
      <div className="scanner-help">
        <b>วิธีใช้งาน</b>
        <p>เปิดกล้องแล้วนำ QR Code จากอีเมลหรือไฟล์ PDF มาไว้ในกรอบ หากกล้องใช้ไม่ได้ให้ค้นหาชื่อผู้เข้าร่วมแล้วกดเช็คอิน</p>
      </div>
      {error && <div className="scan-result error"><XCircle/><div><b>ไม่สามารถเช็คอินได้</b><p>{error}</p></div></div>}
    </section>
    {result && <div className={["scan-result-modal", resultRoleClass, resultFeaturedClass].filter(Boolean).join(" ")} role="dialog" aria-modal="true" aria-labelledby="scan-result-title">
      {resultFeaturedClass && <div className="scan-prosperity-field" aria-hidden="true">
        {prosperityParticles.map((particle) => <span key={particle} />)}
      </div>}
      <div className={["scan-success-hero", result.wasAlreadyCheckedIn ? "already" : "", resultRoleClass, resultFeaturedClass].filter(Boolean).join(" ")}>
        <header className="scan-success-modal-head">
          <button ref={resultCloseRef} className="scan-success-close" type="button" onClick={clearResult} aria-label="ปิดผลลัพธ์"><X/></button>
          <div className="scan-success-heading">
            <div className="scan-success-mark">{result.wasAlreadyCheckedIn ? <AlertTriangle/> : <CheckCircle2/>}</div>
            <div className="scan-success-copy" role="status" aria-live="polite">
              <span>QR CHECK-IN</span>
              <h3 id="scan-result-title">{result.wasAlreadyCheckedIn ? "รายการนี้เช็คอินแล้ว" : "เช็คอินเรียบร้อยแล้ว"}</h3>
              <p>{result.wasAlreadyCheckedIn ? "ระบบพบว่าผู้เข้าร่วมงานได้เช็คอินก่อนหน้านี้" : "บันทึกสถานะเข้าร่วมงานเรียบร้อยแล้ว"}</p>
            </div>
          </div>
        </header>
        <div ref={resultScrollRef} className="scan-success-scroll">
          <div className={`scan-role-band ${resultRoleClass}`}><span>ระดับผู้เข้าร่วมงาน</span><b>{result.participantRole?.toUpperCase() || "GUEST"}</b></div>
          {Boolean(result.teamCheckIns?.length) && <div className="scan-team-auto">
            <div>
              <span>เช็คอินสมาชิกทีมอัตโนมัติ</span>
              <b>{result.teamCheckIns?.length.toLocaleString("th-TH")} คน</b>
              <small>{[result.teamName, result.teamSubmissionCode].filter(Boolean).join(" • ")}</small>
            </div>
            <ul>
              {result.teamCheckIns?.map((member) => {
                const roleClass = participantRoleClass(member.participantRole);
                return <li key={member.registrationCode}>
                  <span>
                    <b>{member.name}</b>
                    <small>{member.registrationCode} • {member.wasAlreadyCheckedIn ? "เช็คอินไว้แล้ว" : "เช็คอินอัตโนมัติแล้ว"}</small>
                  </span>
                  <i className={`status-pill role-pill ${roleClass}`}>{member.participantRole}</i>
                </li>;
              })}
            </ul>
          </div>}
          <dl className="scan-success-details">
            <div><dt>ชื่อ-นามสกุล</dt><dd>{result.name || "-"}</dd></div>
            <div><dt>รหัสลงทะเบียน</dt><dd>{result.registrationCode}</dd></div>
            {result.wasAlreadyCheckedIn && <div><dt>เช็คอินครั้งแรกเมื่อ</dt><dd>{formatScanDate(result.checkedInAt)}</dd></div>}
            {!result.wasAlreadyCheckedIn && <div><dt>เวลาเช็คอิน</dt><dd>{formatScanDate(result.checkedInAt)}</dd></div>}
            <div><dt>ผู้สแกน QR Code</dt><dd>{result.checkedInByEmail || "-"}</dd></div>
            <div><dt>สถานะ</dt><dd>เข้าร่วมงานแล้ว</dd></div>
            <div><dt>เบอร์โทร</dt><dd>{result.phone || "-"}</dd></div>
            <div><dt>หน่วยงาน</dt><dd>{[result.division, result.bureau].filter(Boolean).join(" / ") || "-"}</dd></div>
            <div><dt>ตำแหน่ง</dt><dd>{result.position || "-"}</dd></div>
          </dl>
        </div>
        <div className="scan-success-actions">
          <button className="primary" type="button" onClick={clearResult}><RotateCcw/>สแกน QR Code คนถัดไป</button>
        </div>
      </div>
    </div>}
  </div>;
}

function statusLabel(status?: string | null) {
  if (status === "attended") return "เช็คอินแล้ว";
  if (status === "cancelled") return "ยกเลิก";
  return "รอเช็คอิน";
}

function formatScanDate(value?: string | null) {
  if (!value) return "เมื่อสักครู่";
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(new Date(value));
}
