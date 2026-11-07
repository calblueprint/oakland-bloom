import { redirect } from "next/navigation";
import { getAccount } from "@/lib/auth/account";

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // note: getAccount() uses getUser() instead of getSession() because
  // this sends a request to the Auth server to revalidate auth token,
  // preventing potential spoofing of cookies
  const account = await getAccount();

  // ensure only logged in users have access to the main application
  if (!account) {
    redirect("/login");
  }

  // chef pages need finished onboarding and an approved account, even when a
  // URL is typed in directly. everyone else goes to the page for their state.
  // approval comes from public.users, which chefs can't write
  if (!account.isAdmin && account.status !== "approved") {
    redirect(account.homePath);
  }

  return children;
}
