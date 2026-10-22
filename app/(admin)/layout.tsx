import { redirect } from "next/navigation";
import { getAccount } from "@/lib/auth/account";

// admin-only pages. is_admin comes from public.users, which users can't write.
// the approve action checks it again on its own
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const account = await getAccount();
  if (!account) redirect("/login");
  if (!account.isAdmin) redirect(account.homePath);

  return children;
}
