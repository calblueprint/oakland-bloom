import { redirect } from "next/navigation";
import { parseEmailParam } from "@/lib/auth/validation";
import AccountForm from "../AccountForm";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string | string[] }>;
}) {
  const email = parseEmailParam((await searchParams).email);

  // no usable email means they skipped the first screen, so send them back
  if (!email) redirect("/login");

  return <AccountForm mode="signup" email={email} />;
}
