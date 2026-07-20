"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Activity, BarChart3, Lightbulb, Mail, Menu, PenLine, Phone, TrendingUp } from "lucide-react";
import type { SiteStats } from "../lib/site-analytics";

const navItems = [
  { href: "/#project", hash: "#project", label: "ข้อมูลโครงการ" },
  { href: "/#schedule", hash: "#schedule", label: "กำหนดการ" },
  { href: "/#awards", hash: "#awards", label: "เกณฑ์และรางวัล" },
  { href: "/#downloads", hash: "#downloads", label: "ดาวน์โหลดเอกสาร" },
  { href: "/#faq", hash: "#faq", label: "FAQ" },
  { href: "/#contact", hash: "#contact", label: "ติดต่อ" },
];

export function MobileZoomLock() {
  useEffect(() => {
    let lastTouchEnd = 0;
    const cleanInjectedTextModeClasses = () => {
      document.querySelectorAll("[class*='__text_mode_']").forEach((element) => {
        element.className = String(element.className)
          .split(/\s+/)
          .filter((name) => name && !name.startsWith("__text_mode_"))
          .join(" ");
        if (!element.getAttribute("class")) element.removeAttribute("class");
      });
    };
    const preventGestureZoom = (event: Event) => event.preventDefault();
    const preventPinchZoom = (event: TouchEvent) => {
      if (event.touches.length > 1) event.preventDefault();
    };
    const preventDoubleTapZoom = (event: TouchEvent) => {
      const now = Date.now();
      if (now - lastTouchEnd <= 300) event.preventDefault();
      lastTouchEnd = now;
    };
    const preventTrackpadZoom = (event: WheelEvent) => {
      if (event.ctrlKey) event.preventDefault();
    };

    cleanInjectedTextModeClasses();
    document.addEventListener("DOMContentLoaded", cleanInjectedTextModeClasses, { once: true });
    document.addEventListener("gesturestart", preventGestureZoom, { passive: false });
    document.addEventListener("gesturechange", preventGestureZoom, { passive: false });
    document.addEventListener("gestureend", preventGestureZoom, { passive: false });
    document.addEventListener("touchstart", preventPinchZoom, { passive: false });
    document.addEventListener("touchmove", preventPinchZoom, { passive: false });
    document.addEventListener("touchend", preventDoubleTapZoom, { passive: false });
    window.addEventListener("wheel", preventTrackpadZoom, { passive: false });

    return () => {
      document.removeEventListener("DOMContentLoaded", cleanInjectedTextModeClasses);
      document.removeEventListener("gesturestart", preventGestureZoom);
      document.removeEventListener("gesturechange", preventGestureZoom);
      document.removeEventListener("gestureend", preventGestureZoom);
      document.removeEventListener("touchstart", preventPinchZoom);
      document.removeEventListener("touchmove", preventPinchZoom);
      document.removeEventListener("touchend", preventDoubleTapZoom);
      window.removeEventListener("wheel", preventTrackpadZoom);
    };
  }, []);

  return null;
}

export function SiteVisitTracker() {
  const pathname = usePathname();
  useEffect(() => {
    if (!pathname || pathname.startsWith("/admin") || pathname.startsWith("/api")) return;
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());
    const key = `police-innovation-visit:${today}`;
    try {
      if (window.localStorage.getItem(key)) return;
      window.localStorage.setItem(key, "1");
    } catch {
      // Continue without localStorage so strict browsers still count one server hit.
    }
    const payload = JSON.stringify({ path: pathname });
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/site-visit", new Blob([payload], { type: "application/json" }));
      return;
    }
    void fetch("/api/site-visit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    });
  }, [pathname]);
  return null;
}

export function Header({ registrationOpen = true }: { registrationOpen?: boolean }) {
  const [open,setOpen]=useState(false);
  const [activeHash, setActiveHash] = useState("#project");
  const manualActiveUntil = useRef(0);
  const pathname = usePathname();

  useEffect(() => {
    if (pathname !== "/") return;

    let frame = 0;
    const updateFromHash = () => {
      const hash = window.location.hash || "#project";
      manualActiveUntil.current = Date.now() + 900;
      setActiveHash(hash);
    };
    const updateFromScroll = () => {
      if (Date.now() < manualActiveUntil.current) return;
      const headerHeight = document.querySelector(".site-header")?.getBoundingClientRect().height ?? 96;
      const activationLine = headerHeight + 28;
      const sections = navItems
        .map((item) => ({ ...item, element: document.querySelector(item.hash) }))
        .filter((item): item is typeof item & { element: Element } => Boolean(item.element));
      const current = sections.reduce((active, item) => {
        const top = item.element.getBoundingClientRect().top;
        return top <= activationLine ? item : active;
      }, sections[0]);
      if (current) setActiveHash(current.hash);
    };
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(updateFromScroll);
    };

    updateFromHash();
    window.addEventListener("hashchange", updateFromHash);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("hashchange", updateFromHash);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [pathname]);

  return <header className="site-header"><div className="wide header-row">
    <Link className="brand" href="/"><span className="brand-logo"><img src="/logo-3d.png" alt="Police Innovation Contest 2026"/></span><div><b>Police Innovation Contest 2026</b><small>ประกวดนวัตกรรม สำนักงานตำรวจแห่งชาติ ประจำปี พ.ศ. 2569</small></div></Link>
    <nav className={open?"open":""} aria-label="เมนูหลัก">
      {navItems.map((item) => {
        const active = pathname === "/" && activeHash === item.hash;
        return <a key={item.hash} className={active ? "active" : undefined} aria-current={active ? "page" : undefined} onClick={()=>{manualActiveUntil.current=Date.now()+1200;setActiveHash(item.hash);setOpen(false);}} href={item.href}>{item.label}</a>;
      })}
    </nav>
    {registrationOpen ? <Link className="primary compact" href="/register"><PenLine /> ลงทะเบียนสมัคร</Link> : <span className="primary compact disabled-action" aria-disabled="true"><PenLine /> ปิดรับสมัคร</span>}
    <button className="menu" aria-label={open?"ปิดเมนู":"เปิดเมนู"} aria-expanded={open} onClick={()=>setOpen(value=>!value)}><Menu /></button>
  </div></header>;
}

export function Footer({ stats }: { stats?: SiteStats | null }) {
  const maxDaily = Math.max(1, ...(stats?.last7Days.map((item) => item.count) ?? [1]));
  return <footer><div className={stats ? "wide footer-grid footer-grid-with-stats" : "wide footer-grid"}>
    <div className="footer-column footer-brand"><b>Police Innovation Contest 2026</b><p>ระบบลงทะเบียนเข้าร่วมงานและส่งผลงานประกวดนวัตกรรม สำหรับสำนักงานตำรวจแห่งชาติ ประจำปี พ.ศ. 2569</p></div>
    {stats && <section className="footer-stats" aria-label="สถิติการเข้าใช้งานเว็บไซต์">
      <div className="footer-stats-head"><Activity/><div><span>Website Activity</span><b>สถิติการเข้าใช้งาน</b></div></div>
      <div className="footer-stats-numbers">
        <div><small>ทั้งหมด</small><strong>{formatNumber(stats.total)}</strong></div>
        <div><small>วันนี้</small><strong>{formatNumber(stats.today)}</strong></div>
        <div><small>เฉลี่ย 7 วัน</small><strong>{formatNumber(stats.average7Days)}</strong></div>
      </div>
      <div className="footer-stats-bars">
        {stats.last7Days.map((item) => <span key={item.date} title={`${item.label}: ${formatNumber(item.count)} ครั้ง`}><i style={{ height: `${Math.max(8, Math.round(item.count / maxDaily * 100))}%` }}/><small>{item.label}</small></span>)}
      </div>
      <p><TrendingUp/>วันที่สูงสุดใน 7 วัน: {stats.peakDay.label} ({formatNumber(stats.peakDay.count)} ครั้ง)</p>
    </section>}
    <div className="footer-column footer-links"><b>นโยบาย</b><Link href="/privacy">Privacy Policy</Link><Link href="/pdpa">PDPA Consent</Link></div>
    <div className="footer-column footer-contact" id="contact"><b>ติดต่อ</b><p>กลุ่มงานวิจัยและพัฒนานวัตกรรมทางเทคโนโลยี</p><a href="tel:022052193"><Phone/>0 2205 2193</a><a href="mailto:innocontest@police.go.th"><Mail/>innocontest@police.go.th</a></div>
  </div></footer>;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("th-TH").format(value);
}

export function PageHero({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <section className="page-hero"><div className="wide"><span>{eyebrow}</span><h1>{title}</h1><p>{description}</p></div></section>;
}

export function StepRail({ submission = false }: { submission?: boolean }) {
  const steps = submission ? [["01","ข้อมูลผู้สมัคร","ระบุผู้สมัครหลักและสมาชิกทีม"],["02","ข้อมูลผลงานนวัตกรรม","กรอกรายละเอียดผลงานให้ครบถ้วน"],["03","ไฟล์แนบ","แนบเอกสาร PDF 4 รายการ"]] : [["01","ใช้อีเมลที่ติดต่อได้","ระบบใช้ตรวจสอบรายการลงทะเบียนซ้ำ"],["02","กรอกข้อมูลเพื่อลงทะเบียน","ระบุข้อมูลผู้เข้าร่วมให้ครบถ้วน"],["03","รับเลขลงทะเบียนและ QR Code","ใช้เช็คอินหน้างาน"]];
  return <div className="step-rail">{steps.map(([no,title,body])=><article key={no}><i>{no}</i><div><b>{title}</b><p>{body}</p></div></article>)}</div>;
}

export function SideNotes({ submission = false }: { submission?: boolean }) {
  return <aside className="side-notes"><section><Lightbulb /><h3>{submission ? "ก่อนส่งผลงาน" : "หลังลงทะเบียน"}</h3><p>{submission ? "ตรวจสอบชื่อผลงานไทยและอังกฤษ เตรียมเลขบัตรประชาชน สรุปผลงานให้ชัดเจน และแนบ PDF ให้ครบ 4 รายการ" : "ระบบจะแสดงหน้าสำเร็จพร้อมเลขลงทะเบียนและ QR Code กรุณาเก็บไว้ใช้เช็คอินหน้างาน"}</p></section><section><h3>{submission ? "หลังส่งใบสมัคร" : "หมายเหตุ"}</h3><p>{submission ? "ระบบจะออกรหัสผลงานสำหรับเก็บเป็นหลักฐาน และทีมงานจะตรวจสอบเอกสารตามขั้นตอน" : "หนึ่งอีเมลลงทะเบียนได้หนึ่งรายการ หากต้องแก้ไขข้อมูลให้ติดต่อทีมงานโครงการ"}</p></section></aside>;
}
