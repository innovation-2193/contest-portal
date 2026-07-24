import { mkdir, readFile, rename, writeFile } from "fs/promises";
import path from "path";
import { code } from "./codes";

export type RegistrationInput = {
  email: string;
  provider: "google" | "microsoft" | "local";
  participantRole?: ParticipantRole;
  title: string;
  firstName: string;
  lastName: string;
  citizenId: string;
  phone: string;
  position: string;
  division: string;
  bureau: string;
};

export type RegistrationStatus = "registered" | "attended" | "cancelled";
export type ParticipantRole = "VIP" | "Guest" | "Exhibitor" | "Competitor";

export type RegistrationRecord = {
  registration_code: string;
  participant_role: ParticipantRole;
  title: string;
  first_name: string;
  last_name: string;
  citizen_id: string;
  phone: string;
  position: string;
  division: string;
  bureau: string;
  status: RegistrationStatus;
  checked_in_at?: string | null;
  checked_in_by_email?: string | null;
  registered_at: string;
  email: string;
  provider: "google" | "microsoft" | "local";
};

export type RegistrationUpdateInput = Omit<RegistrationInput, "participantRole"> & {
  registrationCode: string;
  participantRole: ParticipantRole;
  status: RegistrationStatus;
};

type RegistrationStore = {
  registrations: RegistrationRecord[];
};

const unavailableCodes = new Set([
  "ECONNREFUSED",
  "ENOTFOUND",
  "ETIMEDOUT",
  "EHOSTUNREACH",
  "PROTOCOL_CONNECTION_LOST",
  "ER_CON_COUNT_ERROR",
]);

const schemaFallbackCodes = new Set([
  "ER_BAD_FIELD_ERROR",
  "ER_NO_SUCH_TABLE",
  "ER_TABLEACCESS_DENIED_ERROR",
  "ER_COLUMNACCESS_DENIED_ERROR",
  "ER_DBACCESS_DENIED_ERROR",
]);

const storageDir = process.env.APP_STORAGE_DIR ?? path.join(process.cwd(), "storage");
const storePath = path.join(storageDir, "dev-registrations.json");
export const defaultParticipantRole: ParticipantRole = "Guest";
export const participantRoles = ["VIP", "Guest", "Exhibitor", "Competitor"] as const;

let writeQueue: Promise<unknown> = Promise.resolve();

export function isDatabaseUnavailable(error: unknown) {
  const reason = error as { code?: string; message?: string };
  return (
    unavailableCodes.has(reason.code ?? "") ||
    (reason.message ?? "").includes("connect ECONNREFUSED")
  );
}

export function isDatabaseSchemaFallback(error: unknown) {
  const reason = error as { code?: string; message?: string };
  const message = reason.message ?? "";
  return (
    schemaFallbackCodes.has(reason.code ?? "") ||
    message.includes("command denied") ||
    message.includes("Unknown column") ||
    message.includes("doesn't exist")
  );
}

export async function createLocalRegistration(input: RegistrationInput) {
  const work = async () => {
    const store = await readStore();
    const email = input.email.trim().toLowerCase();
    const duplicate = store.registrations.some(
      (item) => item.citizen_id === input.citizenId,
    );

    if (duplicate) {
      throw Object.assign(new Error("duplicate registration"), {
        code: "DUPLICATE_CITIZEN_ID",
      });
    }

    let registrationCode = code("REG");
    while (store.registrations.some((item) => item.registration_code === registrationCode)) {
      registrationCode = code("REG");
    }

    const record: RegistrationRecord = {
      registration_code: registrationCode,
      participant_role: input.participantRole ?? defaultParticipantRole,
      title: input.title,
      first_name: input.firstName,
      last_name: input.lastName,
      citizen_id: input.citizenId,
      phone: input.phone,
      position: input.position,
      division: input.division,
      bureau: input.bureau,
      status: "registered",
      checked_in_at: null,
      checked_in_by_email: null,
      registered_at: new Date().toISOString(),
      email,
      provider: input.provider,
    };

    store.registrations.push(record);
    await writeStore(store);
    return { registrationCode, record };
  };

  const result = writeQueue.then(work, work);
  writeQueue = result.catch(() => undefined);
  return result;
}

export async function findLocalRegistrationByCode(registrationCode: string) {
  await writeQueue.catch(() => undefined);
  const store = await readStore();
  return (
    store.registrations.find(
      (item) => item.registration_code === registrationCode.trim(),
    ) ?? null
  );
}

export async function updateLocalRegistration(input: RegistrationUpdateInput) {
  const work = async () => {
    const store = await readStore();
    const registrationCode = input.registrationCode.trim();
    const index = store.registrations.findIndex((item) => item.registration_code === registrationCode);
    if (index === -1) throw Object.assign(new Error("registration not found"), { code: "NOT_FOUND" });

    const duplicate = store.registrations.some(
      (item) => item.registration_code !== registrationCode && item.citizen_id === input.citizenId,
    );
    if (duplicate) {
      throw Object.assign(new Error("duplicate registration"), {
        code: "DUPLICATE_CITIZEN_ID",
      });
    }

    const current = store.registrations[index];
    store.registrations[index] = {
      ...current,
      email: input.email.trim().toLowerCase(),
      provider: input.provider,
      participant_role: input.participantRole,
      title: input.title,
      first_name: input.firstName,
      last_name: input.lastName,
      citizen_id: input.citizenId,
      phone: input.phone,
      position: input.position,
      division: input.division,
      bureau: input.bureau,
      status: input.status,
      checked_in_at: input.status === "attended" ? current.checked_in_at ?? new Date().toISOString() : null,
      checked_in_by_email: input.status === "attended" ? current.checked_in_by_email ?? null : null,
    };
    await writeStore(store);
    return store.registrations[index];
  };

  const result = writeQueue.then(work, work);
  writeQueue = result.catch(() => undefined);
  return result;
}

export async function deleteLocalRegistration(registrationCode: string) {
  const work = async () => {
    const store = await readStore();
    const before = store.registrations.length;
    store.registrations = store.registrations.filter(
      (item) => item.registration_code !== registrationCode.trim(),
    );
    await writeStore(store);
    return before !== store.registrations.length;
  };

  const result = writeQueue.then(work, work);
  writeQueue = result.catch(() => undefined);
  return result;
}

export async function checkInLocalRegistration(registrationCode: string, checkedInByEmail?: string | null) {
  const work = async () => {
    const store = await readStore();
    const index = store.registrations.findIndex(
      (item) => item.registration_code === registrationCode.trim(),
    );
    if (index === -1) throw Object.assign(new Error("registration not found"), { code: "NOT_FOUND" });
    if (store.registrations[index].status === "cancelled") {
      throw Object.assign(new Error("registration cancelled"), { code: "CANCELLED" });
    }
    const now = new Date().toISOString();
    const wasAlreadyCheckedIn = Boolean(store.registrations[index].checked_in_at);
    store.registrations[index] = {
      ...store.registrations[index],
      status: "attended",
      checked_in_at: store.registrations[index].checked_in_at ?? now,
      checked_in_by_email: store.registrations[index].checked_in_by_email ?? checkedInByEmail ?? null,
    };
    await writeStore(store);
    return { ...store.registrations[index], wasAlreadyCheckedIn };
  };

  const result = writeQueue.then(work, work);
  writeQueue = result.catch(() => undefined);
  return result;
}

export async function listLocalRegistrations() {
  await writeQueue.catch(() => undefined);
  const store = await readStore();
  return [...store.registrations].sort((a, b) => b.registered_at.localeCompare(a.registered_at));
}

async function readStore(): Promise<RegistrationStore> {
  try {
    const raw = await readFile(storePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<RegistrationStore>;
    return {
      registrations: Array.isArray(parsed.registrations)
        ? parsed.registrations.map((item) => ({
          ...item,
          participant_role: normalizeParticipantRole((item as Partial<RegistrationRecord>).participant_role),
        }))
        : [],
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { registrations: [] };
    }
    throw error;
  }
}

export function normalizeParticipantRole(value: unknown): ParticipantRole {
  return participantRoles.includes(value as ParticipantRole) ? value as ParticipantRole : defaultParticipantRole;
}

async function writeStore(store: RegistrationStore) {
  await mkdir(path.dirname(storePath), { recursive: true });
  const tempPath = `${storePath}.${process.pid}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
  await rename(tempPath, storePath);
}
