"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { SiteDailyStat, SiteStats } from "../lib/site-analytics";

type ChartPoint = SiteDailyStat & {
  x: number;
  y: number;
};

const windowSize = 7;
const width = 720;
const height = 230;
const padX = 34;
const padTop = 22;
const padBottom = 42;

export function VisitTrendChart({ stats }: { stats: SiteStats }) {
  const history = stats.visitHistory.length ? stats.visitHistory : stats.last7Days;
  const [windowStart, setWindowStart] = useState(() => Math.max(0, history.length - windowSize));
  const [activePoint, setActivePoint] = useState<ChartPoint | null>(null);
  const chartHeight = height - padTop - padBottom;
  const windowEnd = Math.min(history.length, windowStart + windowSize);
  const visibleDays = history.slice(windowStart, windowEnd);
  const max = Math.max(1, ...visibleDays.map((item) => item.count));
  const canGoOlder = windowStart > 0;
  const canGoNewer = windowEnd < history.length;
  const chartLabel = visibleDays.length
    ? `${visibleDays[0].label} - ${visibleDays[visibleDays.length - 1].label}`
    : "ยังไม่มีข้อมูล";

  const points = useMemo(() => visibleDays.map((item, index) => {
    const x = padX + index * ((width - padX * 2) / Math.max(1, visibleDays.length - 1));
    const y = padTop + chartHeight - (item.count / max) * chartHeight;
    return { ...item, x, y };
  }), [chartHeight, max, visibleDays]);

  const linePath = points.map((item, index) => `${index === 0 ? "M" : "L"} ${item.x.toFixed(2)} ${item.y.toFixed(2)}`).join(" ");
  const areaPath = points.length ? `${linePath} L ${points[points.length - 1].x.toFixed(2)} ${height - padBottom} L ${points[0].x.toFixed(2)} ${height - padBottom} Z` : "";

  function moveWindow(direction: "older" | "newer") {
    setActivePoint(null);
    setWindowStart((current) => {
      if (direction === "older") return Math.max(0, current - windowSize);
      return Math.min(Math.max(0, history.length - windowSize), current + windowSize);
    });
  }

  return <div className="report-visit-trend">
    <div className="report-visit-summary">
      <span><b>{stats.today.toLocaleString("th-TH")}</b><small>วันนี้</small></span>
      <span><b>{stats.yesterday.toLocaleString("th-TH")}</b><small>เมื่อวาน</small></span>
      <span><b>{stats.peakDay.count.toLocaleString("th-TH")}</b><small>สูงสุด {stats.peakDay.label}</small></span>
    </div>
    <div className="report-visit-nav">
      <button className="secondary small-action" type="button" disabled={!canGoOlder} onClick={() => moveWindow("older")}><ChevronLeft/>ก่อนหน้า</button>
      <span>ช่วง {chartLabel}<small>{history.length.toLocaleString("th-TH")} วันที่มียอดเข้าชมมากกว่า 0</small></span>
      <button className="secondary small-action" type="button" disabled={!canGoNewer} onClick={() => moveWindow("newer")}>ถัดไป<ChevronRight/></button>
    </div>
    <div className="report-line-chart" aria-label="ยอดเข้าชมเว็บไซต์ตามช่วงวันที่มีข้อมูล">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" onPointerLeave={() => setActivePoint(null)}>
        <defs>
          <linearGradient id="visitLineGradient" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="#76d6ca"/>
            <stop offset="100%" stopColor="#dfba33"/>
          </linearGradient>
          <linearGradient id="visitAreaGradient" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#76d6ca" stopOpacity="0.28"/>
            <stop offset="100%" stopColor="#76d6ca" stopOpacity="0"/>
          </linearGradient>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = padTop + chartHeight * ratio;
          return <line key={ratio} className="report-line-grid" x1={padX} x2={width - padX} y1={y} y2={y}/>;
        })}
        {areaPath && <path className="report-line-area" d={areaPath}/>}
        {linePath && <path className="report-line-path" d={linePath}/>}
        {points.map((item) => <g
          key={item.date}
          className="report-line-point"
          tabIndex={0}
          role="button"
          aria-label={`${item.label} ${item.count.toLocaleString("th-TH")} ครั้ง`}
          onFocus={() => setActivePoint(item)}
          onBlur={() => setActivePoint(null)}
          onPointerEnter={() => setActivePoint(item)}
          onPointerMove={() => setActivePoint(item)}
          onPointerDown={() => setActivePoint(item)}
        >
          <circle className="report-line-hit" cx={item.x} cy={item.y} r="18"/>
          <circle className={activePoint?.date === item.date ? "report-line-dot active" : "report-line-dot"} cx={item.x} cy={item.y} r={activePoint?.date === item.date ? 7 : 5}/>
          <text className="report-line-label" x={item.x} y={height - 14}>{item.label}</text>
        </g>)}
      </svg>
      {activePoint && <div
        className="report-line-tooltip"
        style={{
          left: `${(activePoint.x / width) * 100}%`,
          top: `${(activePoint.y / height) * 100}%`,
        }}
        role="status"
      >
        <b>{activePoint.count.toLocaleString("th-TH")} ครั้ง</b>
        <span>{activePoint.label}</span>
      </div>}
    </div>
  </div>;
}
