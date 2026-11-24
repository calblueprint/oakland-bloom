import NavButton from "@/components/NavButton/NavButton";
import SignOutButton from "@/components/SignOutButton/SignOutButton";
import { getCurrentUser } from "@/lib/supabase/getUser";

// admin home, moved here from "/"
export default async function AdminHome() {
  const user = await getCurrentUser();

  return (
    <main>
      <h1>Welcome to Oakland Bloom</h1>
      <p>Signed in as {user?.email}</p>

      {/* the admin layout already checks is_admin, so no extra check here */}
      <NavButton href="/admin/accounts">Review Pending Accounts</NavButton>

      <SignOutButton />
    </main>
  );
}
