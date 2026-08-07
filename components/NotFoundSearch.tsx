"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Search } from "lucide-react";

const pages = [
  {
    href: "/",
    title: "หน้าแรก",
    description: "ภาพรวมโครงการ กำหนดการ เกณฑ์ รางวัล และข่าวประชาสัมพันธ์",
    keywords: "home หน้าแรก โครงการ กำหนดการ schedule awards รางวัล ข่าว",
  },
  {
    href: "/register",
    title: "ลงทะเบียนเข้าร่วมงาน",
    description: "เลือกประเภทการลงทะเบียนและเข้าสู่ฟอร์มผู้เข้าร่วมงาน",
    keywords: "register ลงทะเบียน เข้าร่วมงาน attendee qr code",
  },
  {
    href: "/submit",
    title: "สมัครประกวดนวัตกรรม",
    description: "ส่งข้อมูลผลงานและเอกสารประกอบการประกวดนวัตกรรม",
    keywords: "submit สมัคร ประกวด นวัตกรรม innovation submission ผลงาน",
  },
  {
    href: "/profile/login",
    title: "เข้าสู่ระบบผู้เข้าร่วม",
    description: "ดูข้อมูลลงทะเบียน ผลงานที่ส่ง และดาวน์โหลดเอกสารของคุณ",
    keywords: "profile login otp เข้าสู่ระบบ โปรไฟล์ ผู้เข้าร่วม",
  },
  {
    href: "/evaluation",
    title: "แบบประเมินความพึงพอใจ",
    description: "ทำแบบประเมินหลังเช็คอินเข้าร่วมงาน",
    keywords: "evaluation ประเมิน ความพึงพอใจ แบบประเมิน check in",
  },
  {
    href: "/privacy",
    title: "Privacy Policy",
    description: "นโยบายความเป็นส่วนตัวและการดูแลข้อมูล",
    keywords: "privacy policy ความเป็นส่วนตัว นโยบาย ข้อมูล",
  },
  {
    href: "/pdpa",
    title: "PDPA Consent",
    description: "รายละเอียดความยินยอมตาม PDPA",
    keywords: "pdpa consent ความยินยอม ข้อมูลส่วนบุคคล",
  },
];

export function NotFoundSearch({ activeSession }: { activeSession?: { href: "/admin" | "/profile" | "/uci"; label: string } | null }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const normalizedQuery = normalize(query);
  const searchablePages = useMemo(() => pages.map((page) => {
    if (page.href !== "/profile/login" || !activeSession) return page;
    return {
      ...page,
      href: activeSession.href,
      title: activeSession.label,
      description: "Session ของคุณยังไม่หมดอายุ เปิดหน้าที่เกี่ยวข้องได้ทันทีโดยไม่ต้องขอ OTP ใหม่",
      keywords: `${page.keywords} session logged in dashboard หลังบ้าน`,
    };
  }), [activeSession]);
  const results = useMemo(() => {
    if (!normalizedQuery) return searchablePages.slice(0, 4);
    return searchablePages
      .map((page) => ({
        page,
        score: scorePage(page, normalizedQuery),
      }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((item) => item.page)
      .slice(0, 5);
  }, [normalizedQuery, searchablePages]);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const destination = results[0]?.href ?? "/";
    router.push(destination);
  }

  return <div className="not-found-search-shell">
    <form className="not-found-search" onSubmit={submit}>
      <Search aria-hidden="true"/>
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="ค้นหา เช่น ลงทะเบียน, สมัครประกวด, โปรไฟล์, PDPA"
        aria-label="ค้นหาหน้าในเว็บไซต์"
        autoFocus
      />
      <button type="submit">ค้นหา</button>
    </form>
    <div className="not-found-results" aria-live="polite">
      {results.length ? results.map((page) => <Link href={page.href} key={page.href}>
        <span>
          <b>{page.title}</b>
          <small>{page.description}</small>
        </span>
        <ArrowRight aria-hidden="true"/>
      </Link>) : <p>ไม่พบหน้าที่ตรงกับคำค้น ลองใช้คำว่า “ลงทะเบียน” หรือ “สมัครประกวด”</p>}
    </div>
  </div>;
}

function normalize(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function scorePage(page: typeof pages[number], query: string) {
  const haystack = normalize(`${page.title} ${page.description} ${page.keywords}`);
  if (haystack.includes(query)) return 10 + query.length;
  return query.split(" ").filter((part) => part && haystack.includes(part)).length;
}
