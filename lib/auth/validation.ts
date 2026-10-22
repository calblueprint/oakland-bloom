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

// onboarding info collected at sign-up, and again if a chef has to finish it later
export type OnboardingInput = {
  firstName: string;
  lastName: string;
  phone: string;
  restaurantName: string;
  restaurantAddress: string;
  cuisine: string;
};

export type OnboardingField = keyof OnboardingInput;
export type OnboardingFieldErrors = Partial<Record<OnboardingField, string>>;

// which screen each field lives on, so a failed save can send them back to it
export const accountFields: OnboardingField[] = [
  "firstName",
  "lastName",
  "phone",
];
export const restaurantFields: OnboardingField[] = [
  "restaurantName",
  "restaurantAddress",
  "cuisine",
];

const fieldNames: Record<OnboardingField, string> = {
  firstName: "first name",
  lastName: "last name",
  phone: "phone number",
  restaurantName: "restaurant name",
  restaurantAddress: "restaurant address",
  cuisine: "cuisine",
};

// server action args come straight off the network, so don't trust their types
export function cleanOnboardingInput(raw: unknown): OnboardingInput {
  const input = (raw ?? {}) as Record<string, unknown>;
  const clean = (value: unknown) =>
    typeof value === "string" ? value.trim() : "";
  return {
    firstName: clean(input.firstName),
    lastName: clean(input.lastName),
    phone: clean(input.phone),
    restaurantName: clean(input.restaurantName),
    restaurantAddress: clean(input.restaurantAddress),
    cuisine: clean(input.cuisine),
  };
}

// one readable message per bad field. checks only the fields passed in, so
// each screen can validate just its own fields before moving on
export function validateOnboarding(
  input: OnboardingInput,
  fields: OnboardingField[] = [...accountFields, ...restaurantFields],
): OnboardingFieldErrors {
  const errors: OnboardingFieldErrors = {};

  for (const field of fields) {
    const value = input[field].trim();
    if (!value) {
      errors[field] = `Enter your ${fieldNames[field]}.`;
    } else if (value.length > MAX_TEXT_LENGTH) {
      errors[field] =
        `Keep your ${fieldNames[field]} under ${MAX_TEXT_LENGTH} characters.`;
    } else if (field === "phone" && !isValidPhone(value)) {
      errors.phone = "Enter a valid phone number, like (510) 555-0100.";
    }
  }

  return errors;
}

// lenient on formatting, strict on length: 10-15 digits, US or international
export function isValidPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return (
    /^\+?[\d\s().-]+$/.test(phone) && digits.length >= 10 && digits.length <= 15
  );
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
