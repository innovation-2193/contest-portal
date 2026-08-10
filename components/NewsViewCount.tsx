"use client";

import { useEffect, useState } from "react";
import { Eye } from "lucide-react";

export function NewsViewCount({ newsId, initialCount, className = "news-post-views" }: { newsId: string; initialCount: number; className?: string }) {
  const [count, setCount] = useState(Math.max(0, Number(initialCount ?? 0)));

  useEffect(() => {
    let active = true;
    void fetch(`/api/news-views/${encodeURIComponent(newsId)}`, { method: "POST", cache: "no-store" })
      .then((response) => response.ok ? response.json() as Promise<{ viewCount?: number }> : null)
      .then((payload) => {
        if (active && payload && typeof payload.viewCount === "number") setCount(Math.max(0, payload.viewCount));
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [newsId]);

  return <span className={className}><Eye/><span>ยอดผู้ชม {count.toLocaleString("th-TH")} คน</span></span>;
}

