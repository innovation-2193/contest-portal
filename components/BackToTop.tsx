"use client";

import { useEffect, useState } from "react";
import { ArrowUp, Mail } from "lucide-react";

const revealOffset = 480;

export function BackToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setVisible(window.scrollY > revealOffset));
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", update);
    };
  }, []);

  function scrollToTop() {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reducedMotion ? "auto" : "smooth" });
  }

  return <div className="floating-site-actions">
    <button
      type="button"
      className={`back-to-top${visible ? " is-visible" : ""}`}
      onClick={scrollToTop}
      aria-label="กลับขึ้นด้านบน"
      title="กลับขึ้นด้านบน"
      tabIndex={visible ? 0 : -1}
    >
      <ArrowUp aria-hidden="true"/>
    </button>
    <a
      className="contact-officer-button"
      href="mailto:innocontest@police.go.th"
      aria-label="ติดต่อเจ้าหน้าที่ทางอีเมล"
    >
      <Mail aria-hidden="true"/>
    </a>
    <span className="contact-officer-tooltip" role="tooltip">ติดต่อเจ้าหน้าที่</span>
  </div>;
}
