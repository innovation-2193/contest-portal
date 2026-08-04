"use client";

import { useState } from "react";
import { Video, VideoOff } from "lucide-react";

type VideoCheckResponse = {
  ok?: boolean;
  url?: string;
};

export function ContestVideoButton({
  hasVideoLink,
  submissionCode,
}: {
  hasVideoLink: boolean;
  submissionCode: string;
}) {
  const [loading, setLoading] = useState(false);

  async function openVideo() {
    if (loading) return;
    if (!hasVideoLink) {
      window.alert("ผู้เข้าประกวดไม่ได้ส่งมา");
      return;
    }
    setLoading(true);
    let popup: Window | null = null;
    try {
      popup = window.open("about:blank", "_blank");
      if (popup) popup.opener = null;
      const response = await fetch(`/api/contest/submissions/${encodeURIComponent(submissionCode)}/video`, {
        cache: "no-store",
      });
      const data = await response.json() as VideoCheckResponse;
      if (!response.ok || !data.ok || !data.url) {
        popup?.close();
        window.alert("ผู้เข้าประกวดไม่ได้ส่งมา");
        return;
      }
      if (popup) {
        popup.location.href = data.url;
      } else {
        window.open(data.url, "_blank", "noopener,noreferrer");
      }
    } catch {
      popup?.close();
      window.alert("ผู้เข้าประกวดไม่ได้ส่งมา");
    } finally {
      setLoading(false);
    }
  }

  if (!hasVideoLink) {
    return <button className="contest-video-button is-missing" type="button" onClick={openVideo}>
      <VideoOff/>ไม่มี Link Video
    </button>;
  }

  return <button className="contest-video-button" type="button" onClick={openVideo} disabled={loading}>
    <Video/>{loading ? "กำลังตรวจลิงก์" : "Link Video"}
  </button>;
}
