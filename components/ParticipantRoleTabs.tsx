import { participantRoles, type ParticipantRole } from "../lib/local-registrations";
import { ParticipantRoleTabLinks } from "./ParticipantRoleTabLinks";

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
  const roles = ["all", ...participantRoles] as ParticipantRoleFilter[];
  const tabs = roles.map((role) => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(query ?? {})) {
        if (value) params.set(key, value);
      }
      if (role === "all") params.delete(roleParam);
      else params.set(roleParam, role);
      params.delete("page");
      const href = params.toString() ? `${basePath}?${params.toString()}` : basePath;
      return {
        role,
        href,
        label: roleLabels[role],
        count: counts[role].toLocaleString("th-TH"),
      };
    });
  return <ParticipantRoleTabLinks tabs={tabs} activeRole={activeRole}/>;
}
