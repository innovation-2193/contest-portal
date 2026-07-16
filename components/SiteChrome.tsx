"use client";
import Link from "next/link";
import { useState } from "react";
import { Lightbulb, Menu, PenLine, ShieldCheck } from "lucide-react";

export function Header() {
  const [open,setOpen]=useState(false);
  return <header className="site-header"><div className="wide header-row">
    <Link className="brand" href="/"><span><ShieldCheck /></span><div><b>Police Innovation Contest 2026</b><small>ประกวดนวัตกรรม สำนักงานตำรวจแห่งชาติ ประจำปี พ.ศ. 2569</small></div></Link>
    <nav className={open?"open":""} aria-label="เมนูหลัก"><a onClick={()=>setOpen(false)} href="/#project">ข้อมูลโครงการ</a><a onClick={()=>setOpen(false)} href="/#schedule">กำหนดการ</a><a onClick={()=>setOpen(false)} href="/#awards">เกณฑ์และรางวัล</a><a onClick={()=>setOpen(false)} href="/#downloads">ดาวน์โหลดเอกสาร</a><a onClick={()=>setOpen(false)} href="/#faq">FAQ</a><a onClick={()=>setOpen(false)} href="/#contact">ติดต่อ</a></nav>
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
