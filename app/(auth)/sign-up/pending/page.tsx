import Link from "next/link";
import { redirect } from "next/navigation";
import { parseEmailParam } from "@/lib/auth/validation";
import styles from "../../auth.module.css";
import AuthShell from "../../AuthShell";

// Figma: https://www.figma.com/design/fIt7K04YhxAF4WOn8ll2t2/Oakland-Bloom?node-id=106-1300
export default async function PendingApprovalPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string | string[] }>;
}) {
  const email = parseEmailParam((await searchParams).email);

  // no usable email means they didn't come from sign-up, so send them to the start
  if (!email) redirect("/login");

  return (
    <AuthShell
      heading="Pending Approval"
      footer={
        <Link href="/login" className={styles.link}>
          Back to sign in
        </Link>
      }
    >
      <div className={styles.message}>
        <p>
          Thanks for signing up! We&apos;re reviewing your restaurant
          information.
        </p>
        <p>
          First, check your inbox at{" "}
          <span className={styles.messageEmail}>{email}</span> and click the
          link to verify your email.
        </p>
        <p>
          We&apos;ll email <span className={styles.messageEmail}>{email}</span>{" "}
          once your account has been approved.
        </p>
      </div>
    </AuthShell>
  );
}
