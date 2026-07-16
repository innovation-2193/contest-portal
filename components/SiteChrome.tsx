"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Lightbulb, Menu, PenLine } from "lucide-react";

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

export function Header() {
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
    <Link className="primary compact" href="/register"><PenLine /> ลงทะเบียนสมัคร</Link>
    <button className="menu" aria-label={open?"ปิดเมนู":"เปิดเมนู"} aria-expanded={open} onClick={()=>setOpen(value=>!value)}><Menu /></button>
  </div></header>;
}

export function Footer() {
  return <footer><div className="wide footer-grid"><div><b>Police Innovation Contest 2026</b><p>ระบบลงทะเบียนเข้าร่วมงานและส่งผลงานประกวดนวัตกรรม สำหรับสำนักงานตำรวจแห่งชาติ ประจำปี พ.ศ. 2569</p></div><div><b>นโยบาย</b><Link href="/privacy">Privacy Policy</Link><Link href="/pdpa">PDPA Consent</Link></div><div id="contact"><b>ติดต่อ</b><p>กลุ่มงานวิจัยและพัฒนานวัตกรรมทางเทคโนโลยี</p><a href="mailto:innocontest@police.go.th">innocontest@police.go.th</a></div></div></footer>;
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
