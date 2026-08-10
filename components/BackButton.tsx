"use client";

import { ArrowLeft } from "lucide-react";

export function BackButton({ fallbackHref = "/uci" }: { fallbackHref?: string }) {
  const goBack = () => {
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    window.location.assign(fallbackHref);
  };

  return <button className="secondary" type="button" onClick={goBack}><ArrowLeft/>ย้อนกลับ</button>;
}
