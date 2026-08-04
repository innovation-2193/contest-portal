type NameParts = {
  title?: string | null;
  first_name?: string | null;
  last_name?: string | null;
};

const thaiRankTitleMap: Array<[string, string]> = [
  ["พลตำรวจเอกหญิง", "พล.ต.อ.หญิง"],
  ["พลตำรวจเอก", "พล.ต.อ."],
  ["พลตำรวจโทหญิง", "พล.ต.ท.หญิง"],
  ["พลตำรวจโท", "พล.ต.ท."],
  ["พลตำรวจตรีหญิง", "พล.ต.ต.หญิง"],
  ["พลตำรวจตรี", "พล.ต.ต."],
  ["พันตำรวจเอกหญิง", "พ.ต.อ.หญิง"],
  ["พันตำรวจเอก", "พ.ต.อ."],
  ["พันตำรวจโทหญิง", "พ.ต.ท.หญิง"],
  ["พันตำรวจโท", "พ.ต.ท."],
  ["พันตำรวจตรีหญิง", "พ.ต.ต.หญิง"],
  ["พันตำรวจตรี", "พ.ต.ต."],
  ["ร้อยตำรวจเอกหญิง", "ร.ต.อ.หญิง"],
  ["ร้อยตำรวจเอก", "ร.ต.อ."],
  ["ร้อยตำรวจโทหญิง", "ร.ต.ท.หญิง"],
  ["ร้อยตำรวจโท", "ร.ต.ท."],
  ["ร้อยตำรวจตรีหญิง", "ร.ต.ต.หญิง"],
  ["ร้อยตำรวจตรี", "ร.ต.ต."],
  ["ดาบตำรวจหญิง", "ด.ต.หญิง"],
  ["ดาบตำรวจ", "ด.ต."],
  ["จ่าสิบตำรวจหญิง", "จ.ส.ต.หญิง"],
  ["จ่าสิบตำรวจ", "จ.ส.ต."],
  ["สิบตำรวจเอกหญิง", "ส.ต.อ.หญิง"],
  ["สิบตำรวจเอก", "ส.ต.อ."],
  ["สิบตำรวจโทหญิง", "ส.ต.ท.หญิง"],
  ["สิบตำรวจโท", "ส.ต.ท."],
  ["สิบตำรวจตรีหญิง", "ส.ต.ต.หญิง"],
  ["สิบตำรวจตรี", "ส.ต.ต."],
];

export function abbreviateThaiRankTitle(value?: string | null) {
  const original = clean(value);
  if (!original || original === "-") return "";

  const compact = original.replace(/\s+/g, "");
  for (const [full, abbreviated] of thaiRankTitleMap) {
    if (compact.startsWith(full)) {
      return `${abbreviated}${rankSuffix(original, full)}`;
    }
  }
  return original;
}

export function formatApplicantName(input: NameParts) {
  const title = abbreviateThaiRankTitle(input.title);
  const firstName = title ? clean(input.first_name) : abbreviateThaiRankTitle(input.first_name);
  const lastName = clean(input.last_name);
  return `${title}${firstName}${lastName ? ` ${lastName}` : ""}`.replace(/\s+/g, " ").trim() || "-";
}

function clean(value?: string | null) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function rankSuffix(value: string, fullRank: string) {
  let valueIndex = 0;
  let rankIndex = 0;
  while (valueIndex < value.length && rankIndex < fullRank.length) {
    const char = value[valueIndex];
    if (/\s/.test(char)) {
      valueIndex += 1;
      continue;
    }
    if (char !== fullRank[rankIndex]) break;
    valueIndex += 1;
    rankIndex += 1;
  }
  return rankIndex === fullRank.length ? value.slice(valueIndex).replace(/^\s+/, "") : "";
}
