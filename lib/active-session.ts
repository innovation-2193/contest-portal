import { cookieName, getAdminSession, type AdminSession } from "./admin-auth";
import {
  getParticipantSession,
  participantSessionCookie,
  type ParticipantSession,
} from "./participant-session";

type CookieReader = {
  get(name: string): { value: string } | undefined;
};

export type ActiveSession =
  | {
      kind: "super_admin" | "admin";
      email: string;
      href: "/admin";
      label: string;
      admin: AdminSession;
      participant: null;
    }
  | {
      kind: "participant";
      email: string;
      href: "/profile";
      label: "เปิดโปรไฟล์ของคุณ";
      admin: null;
      participant: ParticipantSession;
    };

export function getActiveSession(cookieStore: CookieReader): ActiveSession | null {
  const admin = getAdminSession(cookieStore.get(cookieName)?.value);
  if (admin) {
    return {
      kind: admin.role,
      email: admin.email,
      href: "/admin",
      label: admin.role === "super_admin" ? "เปิดระบบหลังบ้าน Super Admin" : "เปิดระบบหลังบ้าน Admin",
      admin,
      participant: null,
    };
  }

  const participant = getParticipantSession(cookieStore.get(participantSessionCookie)?.value);
  if (participant) {
    return {
      kind: "participant",
      email: participant.email,
      href: "/profile",
      label: "เปิดโปรไฟล์ของคุณ",
      admin: null,
      participant,
    };
  }

  return null;
}
