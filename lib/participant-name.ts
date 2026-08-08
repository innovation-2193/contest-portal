export function participantNameKey(firstName: string, lastName: string) {
  return [firstName, lastName]
    .map((value) => String(value ?? "").normalize("NFKC").replace(/[\u200B-\u200D\uFEFF]/g, "").replace(/\s+/g, " ").trim().toLocaleLowerCase("th-TH"))
    .join(" ")
    .trim();
}
