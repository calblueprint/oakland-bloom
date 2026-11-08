import { redirect } from "next/navigation";
import { signOut } from "@/actions/auth";

// export makes it available for other files to import
// Chef's HOMEPAGE
export default function ChefHome() {
  return (
    <main>
      <h1>Chef Home</h1>

      {/* temporary until the sidebar design has a sign-out */}
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
