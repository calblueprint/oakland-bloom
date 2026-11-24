import type { ElementType } from "react";
import { redirect } from "next/navigation";
import { signOut } from "@/actions/auth";

// Plain server-action sign-out; signOut redirects to /login on success.
// pass a styled button as `as` to change how it looks
export default function SignOutButton({
  as: Button = "button",
}: {
  as?: ElementType;
}) {
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
      <Button type="submit">Sign out</Button>
    </form>
  );
}
