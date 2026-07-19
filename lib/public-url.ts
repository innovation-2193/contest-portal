export const canonicalPublicBaseUrl = "https://innocontest.police.go.th";

const legacyHostPattern = /innocontest\.pumin-freelance\.com/i;

export function publicBaseUrl() {
  const configured = process.env.NEXT_PUBLIC_BASE_URL?.trim();
  const fallback = process.env.NODE_ENV === "production" ? canonicalPublicBaseUrl : "http://localhost:3003";
  const value = (configured || fallback).replace(/\/+$/, "");

  if (legacyHostPattern.test(value)) return canonicalPublicBaseUrl;
  return value;
}
