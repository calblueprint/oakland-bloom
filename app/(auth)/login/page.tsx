"use client";

import { ComponentProps, useState } from "react";
import { unstable_rethrow } from "next/navigation";
import { continueWithEmail } from "@/actions/auth";
import AuthShell from "../AuthShell";
import { TextField } from "../fields";
import { ErrorText, Form, SubmitButton } from "../styles";

// Figma: https://www.figma.com/design/fIt7K04YhxAF4WOn8ll2t2/Oakland-Bloom?node-id=106-1460
const INVALID_EMAIL_ERROR = "Enter a valid email address.";

export default function StartPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // runs when the form is submitted
  const handleContinue: ComponentProps<"form">["onSubmit"] = async e => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      // checks if the email has an account, then redirects to sign in or sign up
      const result = await continueWithEmail(email);

      if (result?.error) {
        setError(
          result.error.code === "invalid_email"
            ? INVALID_EMAIL_ERROR
            : "Something went wrong. Please try again.",
        );
        setIsLoading(false);
      }
    } catch (err) {
      // let Next's redirect through instead of treating it as an error
      unstable_rethrow(err);
      setError(
        "Could not reach the server. Check your connection and try again.",
      );
      setIsLoading(false);
    }
  };

  return (
    <AuthShell heading="Sign In or Create Your Account">
      <Form onSubmit={handleContinue}>
        <TextField
          id="email"
          label="Email"
          type="email"
          autoComplete="username"
          placeholder="Email Address"
          value={email}
          onChange={e => setEmail(e.target.value)}
          disabled={isLoading}
          aria-invalid={error === INVALID_EMAIL_ERROR}
          autoFocus
          required
        />

        {error && <ErrorText role="alert">{error}</ErrorText>}

        <SubmitButton type="submit" disabled={isLoading}>
          Continue
        </SubmitButton>
      </Form>
    </AuthShell>
  );
}
