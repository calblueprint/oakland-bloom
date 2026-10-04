"use client";

import { ComponentProps, useState } from "react";
import { unstable_rethrow } from "next/navigation";
import { loginWithEmailPassword } from "@/actions/auth";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // runs when the form is submitted
  const handleSignIn: ComponentProps<"form">["onSubmit"] = async e => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      // template sign-in method, redirects to "/" by itself on success
      const result = await loginWithEmailPassword({ email, password });

      if (result?.error) {
        if (result.error.code === "invalid_credentials") {
          setError("Email or password is incorrect.");
        } else {
          setError("Something went wrong. Please try again.");
        }
      }
    } catch (err) {
      // let Next's redirect through instead of treating it as an error
      unstable_rethrow(err);
      setError(
        "Could not reach the server. Check your connection and try again.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main>
      <h1>Oakland Bloom</h1>
      <p>Welcome! Sign in to continue.</p>

      <form
        onSubmit={handleSignIn}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "0.5rem",
          maxWidth: "320px",
        }}
      >
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          disabled={isLoading}
          required
        />

        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          disabled={isLoading}
          required
        />

        {error && <p>{error}</p>}

        <button type="submit" disabled={isLoading}>
          {isLoading ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </main>
  );
}
