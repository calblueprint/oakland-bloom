"use client";

import { useState } from "react";
import {
  resendVerification,
  ResendVerificationErrorCode,
} from "@/actions/auth";
import { ErrorText, LinkButton } from "@/app/(auth)/styles";

const resendErrors: Record<ResendVerificationErrorCode, string> = {
  invalid_email: "That email address isn't valid. Go back and sign up again.",
  rate_limited: "A link was just sent. Wait a minute before asking again.",
  unknown: "Couldn't send a new link. Please try again.",
};

// rendered inside the pending message, for when the first link expired or never arrived
export default function ResendVerification({ email }: { email: string }) {
  const [isSending, setIsSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resend = async () => {
    setError(null);
    setSent(false);
    setIsSending(true);

    try {
      const result = await resendVerification(email);
      if (result.error) setError(resendErrors[result.error]);
      else setSent(true);
    } catch {
      setError(
        "Could not reach the server. Check your connection and try again.",
      );
    }
    setIsSending(false);
  };

  return (
    <>
      <p>
        Didn&apos;t get it, or the link expired?{" "}
        <LinkButton type="button" onClick={resend} disabled={isSending}>
          Resend verification email
        </LinkButton>
      </p>

      {/* always mounted so screen readers hear the result */}
      <div aria-live="polite">
        {sent && <p>A new link is on its way. Check your inbox.</p>}
        {error && <ErrorText role="alert">{error}</ErrorText>}
      </div>
    </>
  );
}
