export function isThaiCitizenId(value: string) {
  if (!/^\d{13}$/.test(value)) return false;
  const digits = [...value].map(Number);
  const sum = digits.slice(0, 12).reduce((total, digit, index) => total + digit * (13 - index), 0);
  return (11 - (sum % 11)) % 10 === digits[12];
}
