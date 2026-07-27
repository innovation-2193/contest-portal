"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

export function HomeImagePopup({ imageName, alt }: { imageName: string; alt: string }) {
  const [visible, setVisible] = useState(false);
  const [doNotShowAgain, setDoNotShowAgain] = useState(false);

  useEffect(() => {
    const key = `home-popup-dismissed:${imageName}`;
    const permanentKey = `home-popup-hidden:${imageName}`;
    if (window.localStorage.getItem(permanentKey) === "1") return;
    if (window.sessionStorage.getItem(key) === "1") return;
    const timer = window.setTimeout(() => setVisible(true), 360);
    return () => window.clearTimeout(timer);
  }, [imageName]);

  if (!visible) return null;

  function closePopup() {
    if (doNotShowAgain) {
      window.localStorage.setItem(`home-popup-hidden:${imageName}`, "1");
    } else {
      window.sessionStorage.setItem(`home-popup-dismissed:${imageName}`, "1");
    }
    setVisible(false);
  }

  return <div className="home-popup-modal" role="dialog" aria-modal="true" aria-label="ประกาศหน้าแรก">
    <button className="home-popup-backdrop" type="button" aria-label="ปิด popup" onClick={closePopup}/>
    <article className="home-popup-panel">
      <button className="home-popup-close" type="button" aria-label="ปิด popup" onClick={closePopup}><X aria-hidden="true"/></button>
      <div className="home-popup-image-frame">
        <img src={`/api/home-popup/${encodeURIComponent(imageName)}`} alt={alt}/>
      </div>
      <footer className="home-popup-footer">
        <label><input type="checkbox" checked={doNotShowAgain} onChange={(event) => setDoNotShowAgain(event.target.checked)}/> ไม่ต้องแสดงหน้านี้อีก</label>
        <button type="button" onClick={closePopup}>ปิด</button>
      </footer>
    </article>
  </div>;
}
