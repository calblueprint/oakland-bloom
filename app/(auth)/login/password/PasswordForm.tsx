"use client";

import { ComponentProps, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { loginWithEmailPassword } from "@/actions/auth";
import dot from "@/assets/images/dot.svg";
import styles from "../../auth.module.css";
import AuthShell from "../../AuthShell";
import { PasswordField, TextField } from "../../fields";

// Figma: https://www.figma.com/design/fIt7K04YhxAF4WOn8ll2t2/Oakland-Bloom?node-id=106-1070
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
          setError("Password is incorrect.");
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
          <Link href="/login" className={styles.link}>
            Use a different email
          </Link>
          <Image src={dot} alt="" />
          <Link href="/forgot-password" className={styles.link}>
            Reset password
          </Link>
        </>
      }
    >
      <form onSubmit={handleSignIn} className={styles.form}>
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
          autoFocus
          required
        />

        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}

        <button type="submit" className={styles.button} disabled={isLoading}>
          Continue
        </button>
      </form>
    </AuthShell>
  );
}
