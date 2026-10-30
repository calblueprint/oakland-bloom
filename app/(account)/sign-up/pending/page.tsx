import { redirect } from "next/navigation";
import { signOut } from "@/actions/auth/logout";
import AuthShell from "@/app/(auth)/AuthShell";
import {
  LinkButton,
  Message,
  MessageEmail,
  TextLink,
} from "@/app/(auth)/styles";
import { getAccount } from "@/lib/auth/account";
import { homePathFor } from "@/lib/auth/accountStatus";
import { parseEmailParam } from "@/lib/auth/validation";
import { getCurrentUser } from "@/lib/supabase/getUser";

// Figma: https://www.figma.com/design/fIt7K04YhxAF4WOn8ll2t2/Oakland-Bloom?node-id=106-1300

// form actions can't return anything, so wrap signOut and send them to login
async function signOutAndLeave() {
  "use server";
  await signOut();
  redirect("/login");
}
export default async function PendingApprovalPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string | string[] }>;
}) {
  const account = await getAccount();

  // signed in: verified email, so this page is only for accounts waiting on approval.
  // anyone still onboarding, already approved, or an admin goes where they belong
  if (account) {
    const home = homePathFor(account);
    if (home !== "/sign-up/pending") redirect(home);

    const user = await getCurrentUser();

    return (
      <AuthShell
        heading="Pending Approval"
        footer={
          <form action={signOutAndLeave}>
            <LinkButton type="submit">Sign out</LinkButton>
          </form>
        }
      >
        <Message>
          <p>
            Your email is verified. Our team is reviewing your restaurant
            information.
          </p>
          <p>
            You&apos;ll be able to use Oakland Bloom once your account is
            approved. You&apos;re signed in as{" "}
            <MessageEmail>{user?.email}</MessageEmail>.
          </p>
        </Message>
      </AuthShell>
    );
  }

  // not signed in yet: just signed up and still needs to verify their email
  const email = parseEmailParam((await searchParams).email);
  if (!email) redirect("/login");

  return (
    <AuthShell
      heading="Pending Approval"
      footer={<TextLink href="/login">Back to sign in</TextLink>}
    >
      <Message>
        <p>Thanks for signing up!</p>
        <p>
          First, check your inbox at <MessageEmail>{email}</MessageEmail> and
          click the link to verify your email.
        </p>
        <p>
          After that, our team will review your restaurant information before
          you can use Oakland Bloom.
        </p>
      </Message>
    </AuthShell>
  );
}
