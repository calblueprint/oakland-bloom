import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/getUser";

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // note: we use getUser() instead of getSession() because
  // this sends a request to the Auth server to revalidate auth token,
  // preventing potential spoofing of cookies
  const user = await getCurrentUser();

  // ensure only logged in users have access to the main application
  if (!user) {
    redirect("/login");
  }

  return children;
}
