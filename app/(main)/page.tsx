import { redirect } from "next/navigation";
import { signOut } from "@/actions/auth";
import { getCurrentUser } from "@/lib/supabase/getUser";

export default async function WelcomePage() {
  // template session-reading, same as app/(main)/layout.tsx
  const user = await getCurrentUser();

  return (
    <main>
      <h1>Welcome to Oakland Bloom</h1>
      <p>Signed in as {user?.email}</p>

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
