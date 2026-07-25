"use client";

import Link from "next/link";
import type { KeyboardEvent } from "react";

type RoleTab = {
  role: string;
  href: string;
  label: string;
  count: string;
};

export function ParticipantRoleTabLinks({ tabs, activeRole }: { tabs: RoleTab[]; activeRole: string }) {
  const moveFocus = (event: KeyboardEvent<HTMLAnchorElement>, index: number) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const tabElements = Array.from(event.currentTarget.parentElement?.querySelectorAll<HTMLElement>("[role='tab']") ?? []);
    if (!tabElements.length) return;
    const targetIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? tabElements.length - 1
        : (index + (event.key === "ArrowRight" ? 1 : -1) + tabElements.length) % tabElements.length;
    tabElements[targetIndex]?.focus();
  };

  return <nav className="participant-role-tabs" aria-label="ตัวกรอง Role ผู้เข้าร่วมงาน" role="tablist">
    {tabs.map((tab, index) => {
      const active = activeRole === tab.role;
      return <Link
        className={active ? "active" : ""}
        href={tab.href}
        key={tab.role}
        role="tab"
        aria-selected={active}
        tabIndex={active ? 0 : -1}
        scroll={false}
        onKeyDown={(event) => moveFocus(event, index)}
      >
        <span>{tab.label}</span>
        <b>{tab.count}</b>
      </Link>;
    })}
  </nav>;
}
