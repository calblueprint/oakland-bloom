"use client";

import { ComponentProps, useState } from "react";
import { Instrument_Sans } from "next/font/google";
import Image from "next/image";
import { unstable_rethrow } from "next/navigation";
import { loginWithEmailPassword } from "@/actions/auth";
import glow from "@/assets/images/bg-glow.png";
import eyeIcon from "@/assets/images/eye.svg";
import logo from "@/assets/images/oakland-bloom-logo.png";
import styles from "./login.module.css";

// Figma: https://www.figma.com/design/fIt7K04YhxAF4WOn8ll2t2/Oakland-Bloom?node-id=106-1070
const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  weight: ["500"],
});

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
    <main className={`${styles.page} ${instrumentSans.className}`}>
      <div className={styles.glow}>
        <Image
          src={glow}
          alt=""
          fill
          sizes="100vw"
          className={styles.glowImage}
        />
      </div>

      <div className={styles.card}>
        <div className={styles.content}>
          <div className={styles.header}>
            <Image
              src={logo}
              alt="Oakland Bloom"
              className={styles.logo}
              priority
            />
            <h1 className={styles.heading}>Welcome Back</h1>
          </div>

          <form onSubmit={handleSignIn} className={styles.form}>
            <label htmlFor="email" className={styles.srOnly}>
              Email
            </label>
            <div className={styles.field}>
              <input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="Email"
                className={styles.input}
                value={email}
                onChange={e => setEmail(e.target.value)}
                disabled={isLoading}
                required
              />
            </div>

            <label htmlFor="password" className={styles.srOnly}>
              Password
            </label>
            <div className={styles.field}>
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="Enter password"
                className={styles.input}
                value={password}
                onChange={e => setPassword(e.target.value)}
                disabled={isLoading}
                required
              />
              <button
                type="button"
                className={styles.toggle}
                onClick={() => setShowPassword(s => !s)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
              >
                <Image src={eyeIcon} alt="" />
              </button>
            </div>

            {error && (
              <p className={styles.error} role="alert">
                {error}
              </p>
            )}

            <button
              type="submit"
              className={styles.button}
              disabled={isLoading}
            >
              {isLoading ? "Signing in..." : "Continue"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
