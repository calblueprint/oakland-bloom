import { redirect } from "next/navigation";
import { signOut } from "@/actions/auth";
import NavButton from "@/components/NavButton";
import { getAccount } from "@/lib/auth/account";
import { getCurrentUser } from "@/lib/supabase/getUser";

export default async function WelcomePage() {
  // template session-reading, same as app/(main)/layout.tsx
  const user = await getCurrentUser();
  // is_admin comes from public.users; the admin page checks it again on its own
  const account = await getAccount();

  return (
    <main>
      <h1>Welcome to Oakland Bloom</h1>
      <p>Signed in as {user?.email}</p>

      {account?.isAdmin && (
        <NavButton href="/admin/accounts">Review Accounts</NavButton>
      )}

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
