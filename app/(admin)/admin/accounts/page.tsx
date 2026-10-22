import { Instrument_Sans } from "next/font/google";
import { redirect } from "next/navigation";
import { approveAccount, denyAccount } from "@/actions/admin/review-account";
import { signOut } from "@/actions/auth";
import { getAccount } from "@/lib/auth/account";
import { getAccountStatus } from "@/lib/auth/accountStatus";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import styles from "./accounts.module.css";

const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  weight: ["400", "500"],
});

const errors: Record<string, string> = {
  invalid: "That request wasn't valid. Refresh and try again.",
  incomplete: "That account hasn't finished onboarding yet.",
  failed: "Couldn't update that account. Refresh and try again.",
};

// chef accounts that finished onboarding and are waiting on an admin
async function getAccountsAwaitingApproval() {
  // RLS only lets users read their own rows, so admins list accounts with the
  // service role. this runs on the server, after the admin check below
  const supabase = getSupabaseAdminClient();
  const [usersResult, restaurantsResult] = await Promise.all([
    supabase
      .from("users")
      .select("userid, email, name, phone, is_approved")
      .eq("is_approved", false)
      .eq("is_admin", false),
    supabase
      .from("restaurants")
      .select("userid, name, address, cuisine, created_at"),
  ]);

  if (usersResult.error || restaurantsResult.error) {
    throw new Error("Unable to load accounts awaiting approval.", {
      cause: usersResult.error ?? restaurantsResult.error,
    });
  }

  const restaurants = new Map(
    restaurantsResult.data.map(restaurant => [restaurant.userid, restaurant]),
  );

  return usersResult.data
    .map(user => ({ user, restaurant: restaurants.get(user.userid) ?? null }))
    .filter(account => getAccountStatus(account) === "pending")
    .sort((a, b) =>
      (a.restaurant?.created_at ?? "").localeCompare(
        b.restaurant?.created_at ?? "",
      ),
    );
}

export default async function AdminAccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ done?: string; error?: string }>;
}) {
  // the (admin) layout checks this too, but pages render alongside layouts,
  // so check here before reading every account
  const admin = await getAccount();
  if (!admin?.isAdmin) redirect(admin ? admin.homePath : "/login");

  const { done, error } = await searchParams;
  const accounts = await getAccountsAwaitingApproval();
  const errorMessage = error && errors[error];

  return (
    <main className={`${styles.page} ${instrumentSans.className}`}>
      <header className={styles.header}>
        <h1 className={styles.heading}>Accounts Awaiting Approval</h1>
        <form
          action={async () => {
            "use server";
            const result = await signOut();
            if (result?.error) redirect("/error");
          }}
        >
          <button type="submit" className={styles.link}>
            Sign out
          </button>
        </form>
      </header>

      {done === "approve" && (
        <p className={styles.notice} role="status">
          Account approved. The chef can now sign in and use the app.
        </p>
      )}
      {done === "deny" && (
        <p className={styles.notice} role="status">
          Account denied and deleted. The chef would need to sign up again.
        </p>
      )}
      {errorMessage && (
        <p className={styles.error} role="alert">
          {errorMessage}
        </p>
      )}

      {accounts.length === 0 ? (
        <p className={styles.empty}>No accounts are waiting for approval.</p>
      ) : (
        <ul className={styles.list}>
          {accounts.map(({ user, restaurant }) => (
            <li key={user.userid} className={styles.card}>
              <div className={styles.details}>
                <h2 className={styles.restaurantName}>{restaurant?.name}</h2>
                <dl className={styles.fields}>
                  <dt>Chef</dt>
                  <dd>{user.name}</dd>
                  <dt>Email</dt>
                  <dd>{user.email}</dd>
                  <dt>Phone</dt>
                  <dd>{user.phone}</dd>
                  <dt>Address</dt>
                  <dd>{restaurant?.address}</dd>
                  <dt>Cuisine</dt>
                  <dd>{restaurant?.cuisine}</dd>
                  <dt>Signed up</dt>
                  <dd>
                    {restaurant &&
                      new Date(restaurant.created_at).toLocaleDateString(
                        "en-US",
                        {
                          dateStyle: "medium",
                          timeZone: "America/Los_Angeles",
                        },
                      )}
                  </dd>
                </dl>
              </div>

              <div className={styles.actions}>
                <form action={approveAccount.bind(null, user.userid)}>
                  <button
                    type="submit"
                    className={styles.approve}
                    aria-label={`Approve ${restaurant?.name}`}
                  >
                    Approve
                  </button>
                </form>
                <form action={denyAccount.bind(null, user.userid)}>
                  <button
                    type="submit"
                    className={styles.deny}
                    aria-label={`Deny ${restaurant?.name}`}
                  >
                    Deny
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
