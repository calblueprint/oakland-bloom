"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { accountsHref, parseAccountId } from "@/lib/admin/accountsView";
import { getAccount } from "@/lib/auth/account";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import Logger from "../logging";

// bound per account on the admin page. each checks admin on the server itself,
// so posting to these actions directly doesn't get around the page's check
export async function approveAccount(userId: string) {
  const supabase = await getWaitingAccount(userId);

  // only chef accounts that are still waiting. never touches is_admin
  const { data, error } = await supabase
    .from("users")
    .update({ is_approved: true })
    .eq("userid", userId)
    .eq("is_admin", false)
    .eq("is_approved", false)
    .select("userid");

  if (error || data.length === 0) {
    if (error) {
      Logger.error(`Error approving account: ${error.message} (${error.code})`);
    }
    redirect(accountsHref({ account: userId, error: "failed" }));
  }

  // back to the pending list with the panel closed; the chef has left it
  revalidatePath("/admin/accounts");
  redirect(accountsHref({ done: "approve" }));
}

// denying deletes the login. public.users and public.restaurants cascade from
// it, so the chef is signed out and would have to sign up again
export async function denyAccount(userId: string) {
  const supabase = await getWaitingAccount(userId);

  const { error } = await supabase.auth.admin.deleteUser(userId);
  if (error) {
    Logger.error(`Error denying account: ${error.message} (${error.code})`);
    redirect(accountsHref({ account: userId, error: "failed" }));
  }

  revalidatePath("/admin/accounts");
  redirect(accountsHref({ done: "deny" }));
}

// redirects unless the caller is an admin and userId is a chef account that
// confirmed its email, finished onboarding, and is still waiting on a decision
async function getWaitingAccount(userId: string) {
  const account = await getAccount();
  if (!account) redirect("/login");
  if (!account.isAdmin) redirect(account.homePath);

  if (!parseAccountId(userId) || userId === account.userId) {
    redirect(accountsHref({ error: "invalid" }));
  }

  // errors below keep this chef's panel open so the admin sees what happened
  const fail = (error: string): never =>
    redirect(accountsHref({ account: userId, error }));

  const supabase = getSupabaseAdminClient();

  const [userResult, restaurantResult, authResult] = await Promise.all([
    supabase
      .from("users")
      .select("is_admin, is_approved")
      .eq("userid", userId)
      .maybeSingle(),
    supabase
      .from("restaurants")
      .select("name, address, cuisine")
      .eq("userid", userId)
      .maybeSingle(),
    supabase.auth.admin.getUserById(userId),
  ]);

  const lookupError = userResult.error ?? restaurantResult.error;
  if (lookupError) {
    Logger.error(`Error loading account to review: ${lookupError.message}`);
    fail("failed");
  }

  const user = userResult.data;
  if (!user || user.is_admin || user.is_approved) fail("invalid");

  // a failed Auth lookup isn't the chef's fault, so don't call it unverified
  if (authResult.error) {
    Logger.error(
      `Error checking email confirmation: ${authResult.error.message}`,
    );
    fail("failed");
  }

  // an approved chef with an unconfirmed email still can't sign in
  if (!authResult.data.user?.email_confirmed_at) fail("unverified");

  // deciding before onboarding is done would let the rest skip review
  const restaurant = restaurantResult.data;
  if (!restaurant?.name || !restaurant.address || !restaurant.cuisine) {
    fail("incomplete");
  }

  return supabase;
}
