import { redirect } from "next/navigation";
import { parseEmailParam } from "@/lib/auth/validation";
import AuthShell from "../../AuthShell";
import { Message, MessageEmail, TextLink } from "../../styles";

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
      footer={<TextLink href="/login">Back to sign in</TextLink>}
    >
      <Message>
        <p>
          Thanks for signing up! We&apos;re reviewing your restaurant
          information.
        </p>
        <p>
          First, check your inbox at <MessageEmail>{email}</MessageEmail> and
          click the link to verify your email.
        </p>
        <p>
          We&apos;ll email <MessageEmail>{email}</MessageEmail> once your
          account has been approved.
        </p>
      </Message>
    </AuthShell>
  );
}
