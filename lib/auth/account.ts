import "server-only";
import { cache } from "react";
import { getCurrentUser } from "@/lib/supabase/getUser";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getAccountStatus, homePathFor } from "./accountStatus";

export type Account = NonNullable<Awaited<ReturnType<typeof getAccount>>>;

// the signed-in user's account state, read from public.users and
// public.restaurants (never user_metadata). uses the user's own session, so
// the "read own" RLS policies apply. null when signed out. cached per request
export const getAccount = cache(async () => {
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = await getSupabaseServerClient();
  const [userResult, restaurantResult] = await Promise.all([
    supabase
      .from("users")
      .select("name, phone, is_admin, is_approved")
      .eq("userid", user.id)
      .maybeSingle(),
    supabase
      .from("restaurants")
      .select("name, address, cuisine")
      .eq("userid", user.id)
      .maybeSingle(),
  ]);

  // fail closed: a lookup error must not let anyone past the gates
  if (userResult.error || restaurantResult.error) {
    throw new Error("Unable to load account.", {
      cause: userResult.error ?? restaurantResult.error,
    });
  }

  const row = userResult.data;
  const restaurant = restaurantResult.data;
  const status = getAccountStatus({ user: row, restaurant });
  const isAdmin = row?.is_admin === true;

  // users only stores the full name, so split what sign-up sent for the form
  const meta = user.user_metadata ?? {};
  const fromSignup = (key: string) =>
    typeof meta[key] === "string" ? (meta[key] as string) : "";
  const [savedFirst = "", ...savedLast] = (row?.name ?? "").trim().split(/\s+/);

  return {
    userId: user.id,
    email: user.email ?? "",
    isAdmin,
    status,
    homePath: homePathFor({ isAdmin, status }),
    // what's already saved, so onboarding doesn't ask for it again
    saved: {
      firstName: fromSignup("first_name") || savedFirst,
      lastName: fromSignup("last_name") || savedLast.join(" "),
      phone: row?.phone || fromSignup("phone"),
      restaurantName: restaurant?.name || fromSignup("restaurant_name"),
      restaurantAddress:
        restaurant?.address || fromSignup("restaurant_address"),
      cuisine: restaurant?.cuisine || fromSignup("cuisine"),
    },
  };
});
