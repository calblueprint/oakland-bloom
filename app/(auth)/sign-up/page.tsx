import { redirect } from "next/navigation";
import { parseEmailParam } from "@/lib/auth/validation";
import SignupForm from "./SignupForm";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string | string[] }>;
}) {
  const email = parseEmailParam((await searchParams).email);

  // no usable email means they skipped the first screen, so send them back
  if (!email) redirect("/login");

  return <SignupForm email={email} />;
}
