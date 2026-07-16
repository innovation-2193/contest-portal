import { mkdir, readFile, rename, writeFile } from "fs/promises";
import path from "path";
import { code } from "./codes";

export type RegistrationInput = {
  email: string;
  provider: "google" | "microsoft" | "local";
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

export type RegistrationRecord = {
  registration_code: string;
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
  registered_at: string;
  email: string;
  provider: "google" | "microsoft" | "local";
};

export type RegistrationUpdateInput = RegistrationInput & {
  registrationCode: string;
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

const storageDir = process.env.APP_STORAGE_DIR ?? path.join(process.cwd(), "storage");
const storePath = path.join(storageDir, "dev-registrations.json");

let writeQueue: Promise<unknown> = Promise.resolve();

export function isDatabaseUnavailable(error: unknown) {
  const reason = error as { code?: string; message?: string };
  return (
    unavailableCodes.has(reason.code ?? "") ||
    (reason.message ?? "").includes("connect ECONNREFUSED")
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

export async function checkInLocalRegistration(registrationCode: string) {
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
    store.registrations[index] = {
      ...store.registrations[index],
      status: "attended",
      checked_in_at: store.registrations[index].checked_in_at ?? now,
    };
    await writeStore(store);
    return store.registrations[index];
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
      registrations: Array.isArray(parsed.registrations) ? parsed.registrations : [],
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { registrations: [] };
    }
    throw error;
  }
}

async function writeStore(store: RegistrationStore) {
  await mkdir(path.dirname(storePath), { recursive: true });
  const tempPath = `${storePath}.${process.pid}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
  await rename(tempPath, storePath);
}
