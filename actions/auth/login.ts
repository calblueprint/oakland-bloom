"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase";
import { EmailPasswordCredentials } from "@/types/types";
import Logger from "../logging";

export async function loginWithEmailPassword({
  email,
  password,
}: EmailPasswordCredentials) {
  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    Logger.error(`Error attempting sign in: ${error.message} (${error.code})`);
    return { error: JSON.parse(JSON.stringify(error)) };
  }

  // the main layout sends anyone who isn't approved to the page for their
  // state (onboarding or pending), so there's one place that decides
  revalidatePath("/", "layout");
  redirect("/");
}
