"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAccount } from "@/lib/auth/account";
import {
  cleanOnboardingInput,
  OnboardingFieldErrors,
  OnboardingInput,
  validateOnboarding,
} from "@/lib/auth/validation";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import Logger from "../logging";

export type OnboardingErrorCode = "invalid_input" | "unknown";

export type OnboardingResult = {
  error: OnboardingErrorCode;
  fieldErrors?: OnboardingFieldErrors;
};

// finishes onboarding for a signed-in chef whose info is missing. redirects on
// success, so only failures come back
export async function saveOnboarding(
  input: OnboardingInput,
): Promise<OnboardingResult> {
  const account = await getAccount();
  if (!account) redirect("/login");
  // only accounts still onboarding can change this. once it's submitted, the
  // info an admin reviews can't change underneath them
  if (account.isAdmin || account.status !== "onboarding") {
    redirect(account.homePath);
  }

  const profile = cleanOnboardingInput(input);
  const fieldErrors = validateOnboarding(profile);
  if (Object.keys(fieldErrors).length > 0) {
    return { error: "invalid_input", fieldErrors };
  }

  // chefs have no write grants on these tables, so save with the service role.
  // the row is always the signed-in user's own, and only profile fields are
  // written: is_admin / is_approved are never sent, so their false defaults stay
  const supabase = getSupabaseAdminClient();
  const name = `${profile.firstName} ${profile.lastName}`;

  const { error: userError } = await supabase.from("users").upsert(
    {
      userid: account.userId,
      email: account.email,
      name,
      phone: profile.phone,
    },
    { onConflict: "userid" },
  );
  const { error: restaurantError } = userError
    ? { error: null }
    : await supabase.from("restaurants").upsert(
        {
          userid: account.userId,
          name: profile.restaurantName,
          address: profile.restaurantAddress,
          cuisine: profile.cuisine,
        },
        { onConflict: "userid" },
      );

  const error = userError ?? restaurantError;
  if (error) {
    Logger.error(`Error saving onboarding: ${error.message} (${error.code})`);
    return { error: "unknown" };
  }

  revalidatePath("/", "layout");
  redirect("/sign-up/pending");
}
