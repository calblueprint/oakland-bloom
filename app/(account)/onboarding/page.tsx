import { redirect } from "next/navigation";
import SignupForm from "@/app/(auth)/sign-up/SignupForm";
import { getAccount } from "@/lib/auth/account";

// signed in, but some profile or restaurant info is missing (e.g. sign-up saved
// only part of it). picks up where they left off, prefilled with what exists
export default async function OnboardingPage() {
  const account = await getAccount();
  if (!account) redirect("/login");
  if (account.isAdmin || account.status !== "onboarding") {
    redirect(account.homePath);
  }

  return <SignupForm email={account.email} onboarding={account.saved} />;
}
