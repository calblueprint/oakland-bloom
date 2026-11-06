// pure account-state rules, kept apart from the Supabase lookup so they can be tested

// there's no denied state: denying an account deletes it
export type AccountStatus = "onboarding" | "pending" | "approved";

export type AccountRecord = {
  user: { name: string; phone: string; is_approved: boolean } | null;
  restaurant: {
    name: string | null;
    address: string | null;
    cuisine: string | null;
  } | null;
};

const filled = (value: string | null | undefined) => !!value?.trim();

// onboarding is done once every field the sign-up screens collect is saved.
// the signup trigger can leave restaurant fields null, so check each one
export function getAccountStatus({
  user,
  restaurant,
}: AccountRecord): AccountStatus {
  const onboardingDone =
    !!user &&
    filled(user.name) &&
    filled(user.phone) &&
    !!restaurant &&
    filled(restaurant.name) &&
    filled(restaurant.address) &&
    filled(restaurant.cuisine);

  if (!onboardingDone) return "onboarding";
  return user.is_approved ? "approved" : "pending";
}

// the one page each account belongs on. every gated page redirects here when
// the account doesn't belong on it, and each of these pages accepts exactly
// the state that maps to it, so redirects can't loop
export function homePathFor(account: {
  isAdmin: boolean;
  status: AccountStatus;
}) {
  if (account.isAdmin) return "/admin/accounts";
  switch (account.status) {
    case "onboarding":
      return "/onboarding";
    case "pending":
      return "/sign-up/pending";
    case "approved":
      return "/";
  }
}
