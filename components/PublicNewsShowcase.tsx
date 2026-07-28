"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, CalendarDays, Newspaper, X } from "lucide-react";

export type PublicNewsItem = {
  id: string;
  title: string;
  excerpt: string;
  body: string;
  imageName: string | null;
  publishAt: string;
};

export function PublicNewsShowcase({ news }: { news: PublicNewsItem[] }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [selectedNews, setSelectedNews] = useState<PublicNewsItem | null>(null);

  useEffect(() => {
    if (!selectedNews) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedNews(null);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [selectedNews]);

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
              </div>
              <div className="public-news-copy">
                <span className="public-news-date"><CalendarDays />{formatThaiDate(item.publishAt)}</span>
                <h3>{item.title}</h3>
                <p>{item.excerpt}</p>
                <button type="button" onClick={() => setSelectedNews(item)}>
                  รายละเอียด <ArrowRight />
                </button>
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

      {selectedNews && (
        <div className="public-news-modal" role="dialog" aria-modal="true" aria-labelledby="public-news-modal-title" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setSelectedNews(null);
        }}>
          <article>
            <button className="public-news-modal-close" type="button" onClick={() => setSelectedNews(null)} aria-label="ปิดรายละเอียดข่าว">
              <X />
            </button>
            {selectedNews.imageName && (
              <img src={`/api/news-images/${encodeURIComponent(selectedNews.imageName)}`} alt={selectedNews.title} />
            )}
            <div>
              <span className="public-news-date"><CalendarDays />{formatThaiDate(selectedNews.publishAt)}</span>
              <h2 id="public-news-modal-title">{selectedNews.title}</h2>
              <p className="public-news-modal-lead">{selectedNews.excerpt}</p>
              <p className="public-news-modal-body">{selectedNews.body}</p>
            </div>
          </article>
        </div>
      )}
    </section>
  );
}

function formatThaiDate(value: string) {
  return new Intl.DateTimeFormat("th-TH", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Bangkok",
  }).format(new Date(value));
}
