"use client";

import { ChevronLeft, ChevronRight, Expand, X } from "lucide-react";
import { useEffect, useState } from "react";

export type NewsGalleryImage = {
  src: string;
  alt: string;
};

export function NewsGallery({ images }: { images: NewsGalleryImage[] }) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const hasMultipleImages = images.length > 1;

  useEffect(() => {
    if (selectedIndex === null) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedIndex(null);
      if (event.key === "ArrowLeft" && hasMultipleImages) setSelectedIndex((index) => index === null ? null : (index - 1 + images.length) % images.length);
      if (event.key === "ArrowRight" && hasMultipleImages) setSelectedIndex((index) => index === null ? null : (index + 1) % images.length);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [hasMultipleImages, images.length, selectedIndex]);

  if (!images.length) return null;

  return <>
    <div className={`news-post-gallery${hasMultipleImages ? " has-multiple" : ""}`}>
      {images.map((image, index) => (
        <button className="news-post-gallery-item" type="button" key={image.src} onClick={() => setSelectedIndex(index)} aria-label={`ขยายภาพที่ ${index + 1}`}>
          <img src={image.src} alt={image.alt}/>
          <span><Expand/>ขยายภาพ</span>
          {hasMultipleImages && <b>{index + 1}</b>}
        </button>
      ))}
    </div>

    {selectedIndex !== null && (
      <div className="news-image-lightbox" role="dialog" aria-modal="true" aria-label="ดูภาพข่าวประชาสัมพันธ์">
        <button className="news-image-lightbox-backdrop" type="button" onClick={() => setSelectedIndex(null)} aria-label="ปิดภาพขยาย"/>
        <div className="news-image-lightbox-panel">
          <button className="news-image-lightbox-close" type="button" onClick={() => setSelectedIndex(null)} aria-label="ปิดภาพขยาย"><X/></button>
          <img src={images[selectedIndex].src} alt={images[selectedIndex].alt}/>
          {hasMultipleImages && <>
            <button className="news-image-lightbox-nav previous" type="button" onClick={() => setSelectedIndex((index) => index === null ? null : (index - 1 + images.length) % images.length)} aria-label="ภาพก่อนหน้า"><ChevronLeft/></button>
            <button className="news-image-lightbox-nav next" type="button" onClick={() => setSelectedIndex((index) => index === null ? null : (index + 1) % images.length)} aria-label="ภาพถัดไป"><ChevronRight/></button>
            <span className="news-image-lightbox-count">{selectedIndex + 1} / {images.length}</span>
          </>}
        </div>
      </div>
    )}
  </>;
}
