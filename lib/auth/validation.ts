// shared by the auth forms and the auth server actions so the rules can't drift apart

// password rules from the "Password requirements" frames
export const passwordRules = [
  { label: "8+ characters", test: (p: string) => p.length >= 8 },
  { label: "One uppercase letter", test: (p: string) => /[A-Z]/.test(p) },
  { label: "One lowercase letter", test: (p: string) => /[a-z]/.test(p) },
  { label: "One number", test: (p: string) => /[0-9]/.test(p) },
];

// limit for the sign-up text fields, matched by maxLength on the inputs
export const MAX_TEXT_LENGTH = 200;

export function meetsPasswordRules(password: string) {
  return passwordRules.every(rule => rule.test(password));
}

// Supabase stores emails lowercased, so compare and look them up the same way
export function normalizeEmail(raw: string) {
  return raw.trim().toLowerCase();
}

export function isValidEmail(email: string) {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// reads ?email= from a page's searchParams. returns null when it's missing,
// repeated (?email=a&email=b gives an array), or not an email
export function parseEmailParam(value: string | string[] | undefined) {
  if (typeof value !== "string") return null;
  const email = normalizeEmail(value);
  return isValidEmail(email) ? email : null;
}
