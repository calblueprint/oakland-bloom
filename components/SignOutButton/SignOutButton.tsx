import { redirect } from "next/navigation";
import { signOut } from "@/actions/auth";

// Plain server-action sign-out; signOut redirects to /login on success.
export default function SignOutButton() {
  return (
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
  );
}
