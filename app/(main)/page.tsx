import { redirect } from "next/navigation";
import { getAccount } from "@/lib/auth/account";

// login lands here; send each role to its own home.
// (main)/layout.tsx has already sent everyone else away
export default async function HomeRedirect() {
  const account = await getAccount();
  redirect(account?.isAdmin ? "/admin" : "/chef");
}
