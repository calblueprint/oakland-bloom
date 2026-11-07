import { redirect } from "next/navigation";
import { signOut } from "@/actions/auth";
import NavButton from "@/components/NavButton";
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

      <form
        action={async () => {
          "use server";
          const result = await signOut();
          if (result?.error) {
            redirect("/error");
          }
        }}
      >
        <button type="submit">Sign out</button>
      </form>
    </main>
  );
}
