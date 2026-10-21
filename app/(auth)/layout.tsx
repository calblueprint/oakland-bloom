import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/getUser";

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // cached per request, so this reuses the root layout's getUser() call
  // instead of making a second round trip to the Auth server
  const user = await getCurrentUser();

  // redirect already logged-in users to main page
  if (user) redirect("/");

  return children;
}
