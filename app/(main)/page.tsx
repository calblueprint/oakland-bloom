import { signOut } from "@/actions/auth";
import { getSupabaseServerClient } from "@/lib/supabase";

export default async function WelcomePage() {
  // template session-reading, same as app/(main)/layout.tsx
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main>
      <h1>Welcome to Oakland Bloom</h1>
      <p>Signed in as {user?.email}</p>

      <form
        action={async () => {
          "use server";
          // template sign-out method, redirects to /login by itself
          await signOut();
        }}
      >
        <button type="submit">Sign out</button>
      </form>
    </main>
  );
}
