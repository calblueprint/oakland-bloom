import Link from "next/link";
import { redirect } from "next/navigation";
import { signOut } from "@/actions/auth";
import styles from "@/app/(auth)/auth.module.css";
import AuthShell from "@/app/(auth)/AuthShell";
import { getAccount } from "@/lib/auth/account";
import { parseEmailParam } from "@/lib/auth/validation";

// lives outside (auth) on purpose: that layout sends signed-in users to "/",
// which would bounce verified chefs straight back out of here.
// two cases share this URL:
//   signed out, right after sign-up (?email=): verify your email first
//   signed in and waiting on an admin: pending approval, with sign-out
// Figma: https://www.figma.com/design/fIt7K04YhxAF4WOn8ll2t2/Oakland-Bloom?node-id=106-1300
export default async function PendingPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string | string[] }>;
}) {
  const account = await getAccount();

  if (!account) {
    const email = parseEmailParam((await searchParams).email);

    // no usable email means they didn't come from sign-up, so send them to the start
    if (!email) redirect("/login");

    return (
      <AuthShell
        heading="Verify Your Email"
        footer={
          <Link href="/login" className={styles.link}>
            Back to sign in
          </Link>
        }
      >
        <div className={styles.message}>
          <p>
            Thanks for signing up! Click the link we sent to{" "}
            <span className={styles.messageEmail}>{email}</span> to verify your
            email.
          </p>
          <p>
            Then we&apos;ll review your restaurant information. You can start
            using Oakland Bloom once your account is approved.
          </p>
        </div>
      </AuthShell>
    );
  }

  // signed in: only accounts waiting on approval belong here
  if (account.isAdmin || account.status !== "pending") {
    redirect(account.homePath);
  }

  return (
    <AuthShell
      heading="Pending Approval"
      footer={
        <form
          action={async () => {
            "use server";
            const result = await signOut();
            if (result?.error) redirect("/error");
          }}
        >
          <button type="submit" className={styles.link}>
            Sign out
          </button>
        </form>
      }
    >
      <div className={styles.message}>
        <p>
          Thanks for signing up! Your email is verified, and we&apos;re
          reviewing your restaurant information.
        </p>
        <p>
          Sign in with{" "}
          <span className={styles.messageEmail}>{account.email}</span> anytime
          to check on your account. You can start using Oakland Bloom once
          it&apos;s approved.
        </p>
      </div>
    </AuthShell>
  );
}
