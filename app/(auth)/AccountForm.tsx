"use client";

import { ComponentProps, ReactNode, useState } from "react";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import {
  OnboardingErrorCode,
  saveOnboarding,
  signOut,
  SignUpErrorCode,
  signUpRestaurant,
} from "@/actions/auth";
import {
  accountFields,
  MAX_TEXT_LENGTH,
  meetsPasswordRules,
  OnboardingFieldErrors,
  OnboardingInput,
  passwordRules,
  restaurantFields,
  validateOnboarding,
} from "@/lib/auth/validation";
import styles from "./auth.module.css";
import AuthShell from "./AuthShell";
import { PasswordField, TextField } from "./fields";

// Figma (account): https://www.figma.com/design/fIt7K04YhxAF4WOn8ll2t2/Oakland-Bloom?node-id=106-1260
// Figma (restaurant): https://www.figma.com/design/fIt7K04YhxAF4WOn8ll2t2/Oakland-Bloom?node-id=106-1281

const FIX_FIELDS_ERROR =
  "Some details need fixing. Check the highlighted fields.";

const signUpErrors: Record<SignUpErrorCode, string> = {
  invalid_input: FIX_FIELDS_ERROR,
  weak_password: "That password is too weak. Try a different one.",
  email_exists:
    "An account with this email already exists. Go back to sign in instead.",
  rate_limited: "Too many attempts. Wait a minute and try again.",
  unknown: "Couldn't create your account. Please try again.",
};

const onboardingErrors: Record<OnboardingErrorCode, string> = {
  invalid_input: FIX_FIELDS_ERROR,
  unknown: "Couldn't save your information. Please try again.",
};

const PASSWORD_RULES_ERROR = "Password doesn't meet the requirements yet.";

type Props =
  // new account: both screens, with a password, then the account is created
  | { mode: "signup"; email: string }
  // signed in but info is missing: the same screens, prefilled with whatever
  // was already entered, no password
  | { mode: "onboarding"; email: string; initial: OnboardingInput };

export default function AccountForm(props: Props) {
  const { mode, email } = props;
  const initial = mode === "onboarding" ? props.initial : undefined;

  // which screen we're on, so info from screen 1 stays when moving to screen 2
  const [step, setStep] = useState<"account" | "restaurant">("account");

  // screen 1: account info
  const [firstName, setFirstName] = useState(initial?.firstName ?? "");
  const [lastName, setLastName] = useState(initial?.lastName ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordFocused, setPasswordFocused] = useState(false);

  // screen 2: restaurant info
  const [restaurantName, setRestaurantName] = useState(
    initial?.restaurantName ?? "",
  );
  const [restaurantAddress, setRestaurantAddress] = useState(
    initial?.restaurantAddress ?? "",
  );
  const [cuisine, setCuisine] = useState(initial?.cuisine ?? "");

  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<OnboardingFieldErrors>({});
  const [isLoading, setIsLoading] = useState(false);

  const profile: OnboardingInput = {
    firstName,
    lastName,
    phone,
    restaurantName,
    restaurantAddress,
    cuisine,
  };

  const needsPassword = mode === "signup";
  const allRulesMet = meetsPasswordRules(password);
  const passwordsMatch = confirmPassword === password;

  // checklist opens when they click into the password box, and collapses once every rule passes
  const showChecklist =
    (passwordFocused || password.length > 0) && !allRulesMet;

  // a field's error clears as soon as they start fixing it
  const clearFieldError = (field: keyof OnboardingInput) =>
    setFieldErrors(errors => ({ ...errors, [field]: undefined }));

  // screen 1 Continue: check this screen's fields, then move to the restaurant screen
  const handleContinue: ComponentProps<"form">["onSubmit"] = e => {
    e.preventDefault();
    setError(null);

    const errors = validateOnboarding(profile, accountFields);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    if (needsPassword && !allRulesMet) {
      setError(PASSWORD_RULES_ERROR);
      return;
    }
    if (needsPassword && !passwordsMatch) {
      setError("Passwords don't match.");
      return;
    }

    setStep("restaurant");
  };

  // screen 2 submit: this is where the account and its info actually get saved
  const handleSubmit: ComponentProps<"form">["onSubmit"] = async e => {
    e.preventDefault();
    setError(null);

    const errors = validateOnboarding(profile, restaurantFields);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setIsLoading(true);

    try {
      // both redirect by themselves on success, so only failures come back
      const result =
        mode === "signup"
          ? await signUpRestaurant({ ...profile, email, password })
          : await saveOnboarding(profile);

      if (result?.error) {
        const serverFieldErrors = result.fieldErrors ?? {};
        setFieldErrors(serverFieldErrors);

        // send them back to whichever screen has the problem, everything still filled in
        if (
          result.error === "weak_password" ||
          accountFields.some(field => serverFieldErrors[field])
        ) {
          setStep("account");
        }

        setError(
          mode === "signup"
            ? signUpErrors[result.error as SignUpErrorCode]
            : onboardingErrors[result.error as OnboardingErrorCode],
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

  const goBack = () => {
    setError(null);
    setStep("account");
  };

  const errorMessage = error && (
    <p className={styles.error} role="alert">
      {error}
    </p>
  );

  // signing up can start over with another email; onboarding is already signed in
  const accountFooter: ReactNode =
    mode === "signup" ? (
      <Link href="/login" className={styles.link}>
        Use a different email
      </Link>
    ) : (
      <form
        action={async () => {
          await signOut();
        }}
      >
        <button type="submit" className={styles.link}>
          Sign out
        </button>
      </form>
    );

  if (step === "restaurant") {
    return (
      <AuthShell
        heading="Tell Us About Your Restaurant"
        footer={
          <button
            type="button"
            className={styles.link}
            onClick={goBack}
            disabled={isLoading}
          >
            Go back
          </button>
        }
      >
        {/* noValidate: our own field errors replace the browser's tooltips */}
        <form onSubmit={handleSubmit} className={styles.form} noValidate>
          <TextField
            id="restaurantName"
            label="Restaurant name"
            type="text"
            autoComplete="organization"
            placeholder="Restaurant name"
            value={restaurantName}
            onChange={e => {
              setRestaurantName(e.target.value);
              clearFieldError("restaurantName");
            }}
            disabled={isLoading}
            maxLength={MAX_TEXT_LENGTH}
            error={fieldErrors.restaurantName}
            autoFocus
            required
          />

          <TextField
            id="restaurantAddress"
            label="Restaurant address"
            type="text"
            autoComplete="street-address"
            placeholder="Restaurant address"
            value={restaurantAddress}
            onChange={e => {
              setRestaurantAddress(e.target.value);
              clearFieldError("restaurantAddress");
            }}
            disabled={isLoading}
            maxLength={MAX_TEXT_LENGTH}
            error={fieldErrors.restaurantAddress}
            required
          />

          <TextField
            id="cuisine"
            label="Cuisine"
            type="text"
            autoComplete="off"
            placeholder="Cuisine"
            value={cuisine}
            onChange={e => {
              setCuisine(e.target.value);
              clearFieldError("cuisine");
            }}
            disabled={isLoading}
            maxLength={MAX_TEXT_LENGTH}
            error={fieldErrors.cuisine}
            required
          />

          {errorMessage}

          <button type="submit" className={styles.button} disabled={isLoading}>
            {mode === "signup" ? "Create Account" : "Submit for Approval"}
          </button>
        </form>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      heading={
        mode === "signup" ? "Create Your Account" : "Finish Your Account"
      }
      footer={accountFooter}
    >
      <form onSubmit={handleContinue} className={styles.form} noValidate>
        {/* "username" ties the new password to this email in password managers */}
        <TextField
          id="email"
          label="Email"
          type="email"
          autoComplete="username"
          value={email}
          readOnly
        />

        <TextField
          id="firstName"
          label="First name"
          type="text"
          autoComplete="given-name"
          placeholder="First name"
          value={firstName}
          onChange={e => {
            setFirstName(e.target.value);
            clearFieldError("firstName");
          }}
          maxLength={MAX_TEXT_LENGTH}
          error={fieldErrors.firstName}
          autoFocus
          required
        />

        <TextField
          id="lastName"
          label="Last name"
          type="text"
          autoComplete="family-name"
          placeholder="Last name"
          value={lastName}
          onChange={e => {
            setLastName(e.target.value);
            clearFieldError("lastName");
          }}
          maxLength={MAX_TEXT_LENGTH}
          error={fieldErrors.lastName}
          required
        />

        <TextField
          id="phone"
          label="Phone number"
          type="tel"
          autoComplete="tel"
          placeholder="Phone number"
          value={phone}
          onChange={e => {
            setPhone(e.target.value);
            clearFieldError("phone");
          }}
          maxLength={MAX_TEXT_LENGTH}
          error={fieldErrors.phone}
          required
        />

        {needsPassword && (
          <>
            <PasswordField
              id="password"
              label="Create password"
              autoComplete="new-password"
              placeholder="Create password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onFocus={() => setPasswordFocused(true)}
              onBlur={() => setPasswordFocused(false)}
              aria-describedby="password-rules"
              aria-invalid={
                error === PASSWORD_RULES_ERROR ||
                error === signUpErrors.weak_password
              }
              required
            />

            {/* always mounted so screen readers hear rules flip as they type */}
            <div id="password-rules" aria-live="polite">
              {showChecklist && (
                <ul className={styles.checklist}>
                  {passwordRules.map(rule => {
                    const met = rule.test(password);
                    return (
                      <li key={rule.label} className={styles.checkItem}>
                        <span className={styles.checkIcon} aria-hidden="true">
                          {met ? "✓" : "○"}
                        </span>
                        {rule.label}
                        <span className={styles.srOnly}>
                          {met ? "(met)" : "(not met)"}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}

              {allRulesMet && (
                <p className={styles.checkItem}>
                  <span className={styles.checkIcon} aria-hidden="true">
                    ✓
                  </span>
                  Password requirements met
                </p>
              )}
            </div>

            {allRulesMet && (
              <>
                <PasswordField
                  id="confirmPassword"
                  label="Confirm password"
                  autoComplete="new-password"
                  placeholder="Confirm password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  aria-describedby={
                    confirmPassword.length > 0 ? "password-match" : undefined
                  }
                  aria-invalid={confirmPassword.length > 0 && !passwordsMatch}
                  required
                />

                {confirmPassword.length > 0 && (
                  <p
                    id="password-match"
                    className={styles.checkItem}
                    aria-live="polite"
                  >
                    <span className={styles.checkIcon} aria-hidden="true">
                      {passwordsMatch ? "✓" : "✕"}
                    </span>
                    {passwordsMatch
                      ? "Passwords match"
                      : "Passwords don't match"}
                  </p>
                )}
              </>
            )}
          </>
        )}

        {errorMessage}

        <button type="submit" className={styles.button}>
          Continue
        </button>
      </form>
    </AuthShell>
  );
}
