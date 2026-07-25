"use client";

import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";

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

  return <button
    type="button"
    className={`back-to-top${visible ? " is-visible" : ""}`}
    onClick={scrollToTop}
    aria-label="กลับขึ้นด้านบน"
    title="กลับขึ้นด้านบน"
    tabIndex={visible ? 0 : -1}
  >
    <ArrowUp aria-hidden="true"/>
  </button>;
}
