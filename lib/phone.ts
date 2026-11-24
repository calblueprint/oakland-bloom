// phone numbers are saved as typed at sign-up ("5105550100", "510.555.0100",
// "+1 510 555 0100"), so show US numbers as (510) 555-0100. anything else is
// shown as it was entered
export function formatPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  const local =
    digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (local.length !== 10) return phone;
  return `(${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6)}`;
}
