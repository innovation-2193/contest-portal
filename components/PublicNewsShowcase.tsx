"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { ArrowLeft, ArrowRight, CalendarDays, Eye, Newspaper } from "lucide-react";
import { parseThaiDate } from "../lib/thai-time";

export type PublicNewsItem = {
  id: string;
  title: string;
  excerpt: string;
  body: string;
  imageName: string | null;
  attachmentName?: string | null;
  attachmentOriginalName?: string | null;
  publishAt: string;
  viewCount: number;
};

export function PublicNewsShowcase({ news }: { news: PublicNewsItem[] }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const moveTo = (index: number) => {
    const track = trackRef.current;
    if (!track) return;
    const nextIndex = Math.max(0, Math.min(index, news.length - 1));
    const card = track.children.item(nextIndex) as HTMLElement | null;
    card?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
    setActiveIndex(nextIndex);
  };

  const updateActiveCard = () => {
    const track = trackRef.current;
    if (!track) return;
    const cards = Array.from(track.children) as HTMLElement[];
    const index = cards.reduce(
      (closest, card, cardIndex) =>
        Math.abs(card.offsetLeft - track.scrollLeft) <
        Math.abs(cards[closest].offsetLeft - track.scrollLeft)
          ? cardIndex
          : closest,
      0,
    );
    setActiveIndex(index);
  };

  return (
    <section className="news-section" id="news">
      <div className="wide public-news-showcase">
        <header className="public-news-heading">
          <div>
            <span className="eyebrow">News &amp; Updates</span>
            <h2>ข่าวประชาสัมพันธ์</h2>
            <p>ติดตามประกาศ กำหนดการ และข่าวสารล่าสุดจากโครงการ</p>
          </div>
          <div className="public-news-controls" aria-label="เลื่อนข่าวประชาสัมพันธ์">
            <button type="button" onClick={() => moveTo(activeIndex - 1)} disabled={activeIndex === 0} aria-label="ข่าวก่อนหน้า">
              <ArrowLeft />
            </button>
            <button type="button" onClick={() => moveTo(activeIndex + 1)} disabled={activeIndex === news.length - 1} aria-label="ข่าวถัดไป">
              <ArrowRight />
            </button>
          </div>
        </header>

        <div className={`public-news-track public-news-count-${Math.min(news.length, 3)}`} ref={trackRef} onScroll={updateActiveCard}>
          {news.map((item, index) => (
            <article className="public-news-card" key={item.id}>
              <div className="public-news-media">
                {item.imageName ? (
                  <img src={`/api/news-images/${encodeURIComponent(item.imageName)}`} alt={item.title} />
                ) : (
                  <Newspaper aria-hidden="true" />
                )}
                {index === 0 && <span className="public-news-featured">ข่าวล่าสุด</span>}
                <span className="public-news-views"><Eye />ยอดผู้ชม {formatViewCount(item.viewCount)} คน</span>
              </div>
              <div className="public-news-copy">
                <span className="public-news-date"><CalendarDays />{formatThaiDate(item.publishAt)}</span>
                <h3>{item.title}</h3>
                <p>{item.excerpt}</p>
                <Link href={"/news/" + encodeURIComponent(item.id)}>
                  รายละเอียด <ArrowRight />
                </Link>
              </div>
            </article>
          ))}
        </div>

        {news.length > 1 && (
          <div className="public-news-dots" aria-label="เลือกข่าวประชาสัมพันธ์">
            {news.map((item, index) => (
              <button
                type="button"
                className={index === activeIndex ? "active" : ""}
                key={item.id}
                onClick={() => moveTo(index)}
                aria-label={`ข่าวที่ ${index + 1}`}
                aria-current={index === activeIndex ? "true" : undefined}
              />
            ))}
          </div>
        )}
      </div>

    </section>
  );
}

function formatViewCount(value: number) {
  return Math.max(0, Number(value ?? 0)).toLocaleString("th-TH");
}

function formatThaiDate(value: string) {
  const date = parseThaiDate(value);
  if (!date) return "-";
  return new Intl.DateTimeFormat("th-TH", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Bangkok",
  }).format(date);
}
