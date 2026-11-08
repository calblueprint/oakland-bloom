import "server-only";
import type { AccountTab } from "./accountsView";
import Logger from "@/actions/logging";
import { getAccountStatus } from "@/lib/auth/accountStatus";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

// what the account cards and the details panel show for one chef
export type ChefAccount = {
  userId: string;
  name: string;
  email: string;
  phone: string;
  restaurantName: string;
  restaurantAddress: string;
  // pending can be approved or denied; approved is read-only
  status: "pending" | "approved";
};

type UserRow = {
  userid: string;
  email: string;
  name: string;
  phone: string;
  is_approved: boolean;
};
type RestaurantRow = {
  userid: string;
  name: string | null;
  address: string | null;
  cuisine: string | null;
  created_at: string;
};

function toChefAccount(
  user: UserRow,
  restaurant: RestaurantRow | null,
): ChefAccount {
  return {
    userId: user.userid,
    name: user.name.trim(),
    email: user.email,
    phone: user.phone.trim(),
    restaurantName: restaurant?.name?.trim() ?? "",
    restaurantAddress: restaurant?.address?.trim() ?? "",
    status: user.is_approved ? "approved" : "pending",
  };
}

// a chef is only reviewable once they confirmed their email: approving an
// unconfirmed one leaves them unable to sign in. that lives on the Auth user.
// a failed lookup hides the chef rather than showing one we couldn't check
async function isEmailConfirmed(userId: string) {
  const { data, error } =
    await getSupabaseAdminClient().auth.admin.getUserById(userId);
  if (error) {
    await Logger.error(
      `Error checking email confirmation: ${error.message} (${error.code})`,
    );
    return false;
  }
  return !!data.user?.email_confirmed_at;
}

// pending: confirmed email, finished onboarding, waiting on an admin.
// approved: every approved chef. denied accounts are deleted, so that tab is
// always empty until there's a denied status to query.
// RLS only lets users read their own rows, so this uses the service role. call
// it only after checking the caller is an admin
export async function listChefAccounts(
  tab: AccountTab,
): Promise<ChefAccount[]> {
  if (tab === "denied") return [];

  const supabase = getSupabaseAdminClient();
  const usersResult = await supabase
    .from("users")
    .select("userid, email, name, phone, is_approved")
    .eq("is_admin", false)
    .eq("is_approved", tab === "approved");
  if (usersResult.error) {
    throw new Error("Unable to load chef accounts.", {
      cause: usersResult.error,
    });
  }
  if (usersResult.data.length === 0) return [];

  const restaurantsResult = await supabase
    .from("restaurants")
    .select("userid, name, address, cuisine, created_at")
    .in(
      "userid",
      usersResult.data.map(user => user.userid),
    );
  if (restaurantsResult.error) {
    throw new Error("Unable to load chef accounts.", {
      cause: restaurantsResult.error,
    });
  }

  const restaurants = new Map(
    restaurantsResult.data.map(restaurant => [restaurant.userid, restaurant]),
  );
  let accounts = usersResult.data.map(user => ({
    user,
    restaurant: restaurants.get(user.userid) ?? null,
  }));

  if (tab === "pending") {
    accounts = accounts.filter(
      account => getAccountStatus(account) === "pending",
    );
    const confirmed = await Promise.all(
      accounts.map(({ user }) => isEmailConfirmed(user.userid)),
    );
    accounts = accounts.filter((_, i) => confirmed[i]);
  }

  // oldest sign-up first, so the longest wait is at the top
  return accounts
    .sort((a, b) =>
      (a.restaurant?.created_at ?? "").localeCompare(
        b.restaurant?.created_at ?? "",
      ),
    )
    .map(({ user, restaurant }) => toChefAccount(user, restaurant));
}

// one chef for the details panel, from the ?account= id. returns null unless
// it's a chef the lists above would show: never admins, and never accounts
// still onboarding or with an unconfirmed email. same service-role caveat
export async function getChefAccount(
  userId: string,
): Promise<ChefAccount | null> {
  const supabase = getSupabaseAdminClient();
  const [userResult, restaurantResult] = await Promise.all([
    supabase
      .from("users")
      .select("userid, email, name, phone, is_approved, is_admin")
      .eq("userid", userId)
      .maybeSingle(),
    supabase
      .from("restaurants")
      .select("userid, name, address, cuisine, created_at")
      .eq("userid", userId)
      .maybeSingle(),
  ]);
  if (userResult.error || restaurantResult.error) {
    throw new Error("Unable to load chef account.", {
      cause: userResult.error ?? restaurantResult.error,
    });
  }

  const user = userResult.data;
  const restaurant = restaurantResult.data;
  if (!user || user.is_admin) return null;

  if (!user.is_approved) {
    if (getAccountStatus({ user, restaurant }) !== "pending") return null;
    if (!(await isEmailConfirmed(userId))) return null;
  }

  return toChefAccount(user, restaurant);
}
