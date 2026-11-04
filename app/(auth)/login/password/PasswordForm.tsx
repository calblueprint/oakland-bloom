"use client";

import { ComponentProps, useState } from "react";
import Image from "next/image";
import { unstable_rethrow } from "next/navigation";
import { loginWithEmailPassword } from "@/actions/auth";
import dot from "@/assets/images/dot.svg";
import AuthShell from "../../AuthShell";
import { PasswordField, TextField } from "../../fields";
import { ErrorText, Form, SubmitButton, TextLink } from "../../styles";

// Figma: https://www.figma.com/design/fIt7K04YhxAF4WOn8ll2t2/Oakland-Bloom?node-id=106-1070
const WRONG_PASSWORD_ERROR = "Password is incorrect.";

export default function PasswordForm({ email }: { email: string }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // runs when the form is submitted
  const handleSignIn: ComponentProps<"form">["onSubmit"] = async e => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      // redirects to "/" by itself on success, so only failures come back
      const result = await loginWithEmailPassword({ email, password });

      if (result?.error) {
        if (result.error.code === "invalid_credentials") {
          setError(WRONG_PASSWORD_ERROR);
        } else if (result.error.code === "email_not_confirmed") {
          setError(
            "Please verify your email first. Check your inbox for the link.",
          );
        } else {
          setError("Something went wrong. Please try again.");
        }
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
    <AuthShell
      heading="Welcome Back"
      footer={
        <>
          <TextLink href="/login">Use a different email</TextLink>
          <Image src={dot} alt="" />
          <TextLink href="/forgot-password">Reset password</TextLink>
        </>
      }
    >
      <Form onSubmit={handleSignIn}>
        {/* "username" ties the saved password to this email in password managers */}
        <TextField
          id="email"
          label="Email"
          type="email"
          autoComplete="username"
          value={email}
          readOnly
        />

        <PasswordField
          id="password"
          label="Password"
          autoComplete="current-password"
          placeholder="Enter password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          disabled={isLoading}
          aria-invalid={error === WRONG_PASSWORD_ERROR}
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
