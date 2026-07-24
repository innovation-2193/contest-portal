import Link from "next/link";
import { participantRoles, type ParticipantRole } from "../lib/local-registrations";

export type ParticipantRoleFilter = "all" | ParticipantRole;
export type ParticipantRoleCounts = Record<ParticipantRoleFilter, number>;

const roleLabels: Record<ParticipantRoleFilter, string> = {
  all: "ทั้งหมด",
  VIP: "VIP",
  Guest: "Guest",
  Exhibitor: "Exhibitor",
  Competitor: "Competitor",
};

export function normalizeParticipantRoleFilter(value?: string | null): ParticipantRoleFilter {
  return participantRoles.includes(value as ParticipantRole) ? value as ParticipantRole : "all";
}

export function buildParticipantRoleCounts(records: Array<{ participant_role: ParticipantRole }>): ParticipantRoleCounts {
  const counts = Object.fromEntries(["all", ...participantRoles].map((role) => [role, 0])) as ParticipantRoleCounts;
  counts.all = records.length;
  for (const record of records) {
    counts[record.participant_role] += 1;
  }
  return counts;
}

export function ParticipantRoleTabs({
  activeRole,
  basePath,
  counts,
  query,
  roleParam = "participantRole",
}: {
  activeRole: ParticipantRoleFilter;
  basePath: string;
  counts: ParticipantRoleCounts;
  query?: Record<string, string | null | undefined>;
  roleParam?: string;
}) {
  return <nav className="participant-role-tabs" aria-label="ตัวกรอง Role ผู้เข้าร่วมงาน">
    {(["all", ...participantRoles] as ParticipantRoleFilter[]).map((role) => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(query ?? {})) {
        if (value) params.set(key, value);
      }
      if (role === "all") params.delete(roleParam);
      else params.set(roleParam, role);
      params.delete("page");
      const href = params.toString() ? `${basePath}?${params.toString()}` : basePath;
      return <Link className={activeRole === role ? "active" : ""} href={href} key={role}>
        <span>{roleLabels[role]}</span>
        <b>{counts[role].toLocaleString("th-TH")}</b>
      </Link>;
    })}
  </nav>;
}
