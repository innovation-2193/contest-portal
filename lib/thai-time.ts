export const THAI_TIME_ZONE = "Asia/Bangkok";

const THAI_UTC_OFFSET_MINUTES = 7 * 60;
const localDateTimePattern = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
const naiveDateTimePattern = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2}(?:\.\d{1,3})?)?$/;

export function thaiLocalDateTimeToIso(value: string) {
  const match = value.trim().match(localDateTimePattern);
  if (!match) return "";

  const [, year, month, day, hour, minute] = match;
  const localValue = `${year}-${month}-${day}T${hour}:${minute}`;
  const timestamp = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
  ) - THAI_UTC_OFFSET_MINUTES * 60_000;
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime()) || formatThaiDateTimeInput(date) !== localValue) return "";
  return date.toISOString();
}

export function parseThaiDate(value: string | Date) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (!value) return null;

  const rawValue = value.trim();
  const thaiIso = naiveDateTimePattern.test(rawValue) ? thaiLocalDateTimeToIso(rawValue.slice(0, 16)) : "";
  const date = new Date(thaiIso || rawValue);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function normalizeThaiDateValue(value: string | Date | null | undefined) {
  if (!value) return "";
  const date = parseThaiDate(value);
  return date ? date.toISOString() : "";
}

export function formatThaiDateTimeInput(value: string | Date | null | undefined) {
  const date = value ? parseThaiDate(value) : null;
  if (!date) return "";

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: THAI_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}
