export const canonicalPublicBaseUrl = "https://innocontest.police.go.th";

const legacyHostPattern = /innocontest\.pumin-freelance\.com/i;
const internalHostPattern = /^(?:0\.0\.0\.0|127(?:\.\d{1,3}){3}|localhost)(?::\d+)?$/i;

export function publicBaseUrl() {
  const configured = process.env.NEXT_PUBLIC_BASE_URL?.trim();
  const fallback = process.env.NODE_ENV === "production" ? canonicalPublicBaseUrl : "http://localhost:3003";
  const value = (configured || fallback).replace(/\/+$/, "");

  if (legacyHostPattern.test(value)) return canonicalPublicBaseUrl;
  if (process.env.NODE_ENV === "production" && isInternalUrl(value)) return canonicalPublicBaseUrl;
  return value;
}

export function publicSiteUrl(pathname: string, request?: Request) {
  const developmentOrigin = request && process.env.NODE_ENV !== "production"
    ? new URL(request.url).origin
    : null;
  const base = new URL(`${developmentOrigin ?? publicBaseUrl()}/`);
  const target = new URL(pathname, base);
  return target.origin === base.origin ? target : base;
}

function isInternalUrl(value: string) {
  try {
    return internalHostPattern.test(new URL(value).host);
  } catch {
    return true;
  }
}
