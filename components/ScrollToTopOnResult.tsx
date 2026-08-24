"use client";

import { useEffect } from "react";

export function ScrollToTopOnResult({ active }: { active: boolean }) {
  useEffect(() => {
    if (!active) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, left: 0, behavior: reducedMotion ? "auto" : "smooth" });
  }, [active]);

  return null;
}
