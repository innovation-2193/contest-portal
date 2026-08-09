"use client";

import { useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Play, Video } from "lucide-react";

export type UciVideoCarouselItem = {
  id: string;
  title: string;
  url: string;
  thumbnailUrl: string | null;
  sourceLabel: string;
};

export function UciVideoCarousel({ videos }: { videos: UciVideoCarouselItem[] }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  if (!videos.length) return null;

  const moveTo = (index: number) => {
    const nextIndex = Math.max(0, Math.min(index, videos.length - 1));
    const track = trackRef.current;
    const card = track?.children.item(nextIndex) as HTMLElement | null;
    card?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
    setActiveIndex(nextIndex);
  };

  const updateActiveCard = () => {
    const track = trackRef.current;
    if (!track) return;
    const cards = Array.from(track.children) as HTMLElement[];
    if (!cards.length) return;
    const index = cards.reduce(
      (closest, card, cardIndex) => Math.abs(card.offsetLeft - track.scrollLeft) < Math.abs(cards[closest].offsetLeft - track.scrollLeft) ? cardIndex : closest,
      0,
    );
    setActiveIndex(index);
  };

  return <section className="uci-video-section" aria-labelledby="uci-video-title">
    <div className="wide">
      <header className="uci-video-heading">
        <div><span className="eyebrow">UCI How-to</span><h2 id="uci-video-title"><Video/>สอนการใช้งาน</h2><p>คลิปแนะนำขั้นตอนการเช็คอิน Lucky Draw และเครื่องมือที่เจ้าหน้าที่ UCI ใช้ในวันงาน</p></div>
        {videos.length > 1 && <div className="uci-video-controls" aria-label="เลื่อนคลิปสอนการใช้งาน"><button type="button" onClick={() => moveTo(activeIndex - 1)} disabled={activeIndex === 0} aria-label="คลิปก่อนหน้า"><ArrowLeft/></button><button type="button" onClick={() => moveTo(activeIndex + 1)} disabled={activeIndex === videos.length - 1} aria-label="คลิปถัดไป"><ArrowRight/></button></div>}
      </header>
      <div className={`uci-video-track uci-video-count-${Math.min(videos.length, 3)}`} ref={trackRef} onScroll={updateActiveCard}>
        {videos.map((video) => <article className="uci-video-card" key={video.id}>
          <a className="uci-video-media" href={video.url} target="_blank" rel="noreferrer" aria-label={`เปิดคลิป ${video.title}`}>
            {video.thumbnailUrl ? <img src={video.thumbnailUrl} alt="" onError={(event) => {
              const fallbackUrl = video.thumbnailUrl?.replace("/maxresdefault.jpg", "/hqdefault.jpg");
              if (fallbackUrl && event.currentTarget.src !== fallbackUrl) event.currentTarget.src = fallbackUrl;
            }}/> : <Video aria-hidden="true"/>}
            <span className="uci-video-play"><Play fill="currentColor"/></span>
          </a>
          <div className="uci-video-copy"><h3>{video.title}</h3><a href={video.url} target="_blank" rel="noreferrer">เปิดดูคลิปบน {video.sourceLabel} <ArrowRight/></a></div>
        </article>)}
      </div>
      {videos.length > 1 && <div className="uci-video-dots" aria-label="เลือกคลิปสอนการใช้งาน">{videos.map((video, index) => <button type="button" className={index === activeIndex ? "active" : ""} key={video.id} onClick={() => moveTo(index)} aria-label={`คลิปที่ ${index + 1}`} aria-current={index === activeIndex ? "true" : undefined}/>)}</div>}
    </div>
  </section>;
}
