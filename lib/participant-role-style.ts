export function participantRoleClass(role?: string | null) {
  const normalized = role?.trim().toLowerCase();
  if (normalized === "vip") return "role-vip";
  if (normalized === "exhibitor") return "role-exhibitor";
  if (normalized === "competitor" || normalized === "ผู้สมัครประกวด") return "role-competitor";
  return "role-guest";
}

export function isFeaturedCheckInRole(role?: string | null) {
  const normalized = role?.trim().toLowerCase();
  return normalized === "vip" || normalized === "exhibitor";
}
