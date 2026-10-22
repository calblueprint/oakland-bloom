"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  cleanOnboardingInput,
  isValidEmail,
  meetsPasswordRules,
  normalizeEmail,
  OnboardingFieldErrors,
  validateOnboarding,
} from "@/lib/auth/validation";
import { getSupabaseServerClient } from "@/lib/supabase";
import Logger from "../logging";

export type SignUpInput = {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone: string;
  restaurantName: string;
  restaurantAddress: string;
  cuisine: string;
};

export type SignUpErrorCode =
  | "invalid_input"
  | "weak_password"
  | "email_exists"
  | "rate_limited"
  | "unknown";

// server action args come straight off the network, so don't trust their types
const clean = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

function toErrorCode(code: string | undefined): SignUpErrorCode {
  switch (code) {
    case "weak_password":
      return "weak_password";
    case "user_already_exists":
    case "email_exists":
      return "email_exists";
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return "rate_limited";
    default:
      return "unknown";
  }
}

export type SignUpResult = {
  error: SignUpErrorCode;
  fieldErrors?: OnboardingFieldErrors;
};

// redirects on success, so only failures come back
export async function signUpRestaurant(
  input: SignUpInput,
): Promise<SignUpResult> {
  const email = normalizeEmail(clean(input?.email));
  const password = typeof input?.password === "string" ? input.password : "";
  // profile info saved on the user. no role or approval is set here on purpose
  const profile = {
    first_name: clean(input?.firstName),
    last_name: clean(input?.lastName),
    phone: clean(input?.phone),
    restaurant_name: clean(input?.restaurantName),
    restaurant_address: clean(input?.restaurantAddress),
    cuisine: clean(input?.cuisine),
  };

  // the form checks all of this too, but this endpoint is callable directly
  const fieldErrors = validateOnboarding(cleanOnboardingInput(input));
  if (!isValidEmail(email) || Object.keys(fieldErrors).length > 0) {
    return { error: "invalid_input", fieldErrors };
  }
  if (!meetsPasswordRules(password)) return { error: "weak_password" };

  const supabase = await getSupabaseServerClient();
  const origin = (await headers()).get("origin");
  const { data, error } = await supabase.auth.signUp({
    email: normalizeEmail(input.email),
    password,
    options: {
      // where the "verify your email" link sends them. without it Supabase uses the project's Site URL
      emailRedirectTo: `${origin}/auth/callback`,
      data: profile,
    },
  });

  if (error) {
    Logger.error(`Error signing up: ${error.message} (${error.code})`);
    return { error: toErrorCode(error.code) };
  }

  // with email confirmation on, Supabase hides an existing account by
  // returning success with a user that has no identities
  if (data.user?.identities?.length === 0) return { error: "email_exists" };

  // email confirmation off: they're signed in already, so continue into the app
  if (data.session) {
    revalidatePath("/", "layout");
    redirect("/");
  }

  // email confirmation on: no session until they click the link in their inbox
  redirect(`/sign-up/pending?email=${encodeURIComponent(email)}`);
}
