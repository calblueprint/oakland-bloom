"use client";

import { ComponentProps, useState } from "react";
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
  OnboardingField,
  OnboardingFieldErrors,
  OnboardingInput,
  passwordRules,
  restaurantFields,
  validateOnboarding,
} from "@/lib/auth/validation";
import AuthShell from "../AuthShell";
import { PasswordField, TextField } from "../fields";
import {
  CheckIcon,
  CheckItem,
  CheckLine,
  Checklist,
  ErrorText,
  Form,
  LinkButton,
  SrOnly,
  SubmitButton,
  TextLink,
} from "../styles";

// Figma (account): https://www.figma.com/design/fIt7K04YhxAF4WOn8ll2t2/Oakland-Bloom?node-id=106-1260
// Figma (restaurant): https://www.figma.com/design/fIt7K04YhxAF4WOn8ll2t2/Oakland-Bloom?node-id=106-1281

const signUpErrors: Record<SignUpErrorCode, string> = {
  invalid_input: "Please fill in every field.",
  weak_password: "That password is too weak. Try a different one.",
  email_exists:
    "An account with this email already exists. Go back to sign in instead.",
  rate_limited: "Too many attempts. Wait a minute and try again.",
  unknown: "Couldn't create your account. Please try again.",
};

const onboardingErrors: Record<OnboardingErrorCode, string> = {
  invalid_input: "Some details need fixing. Check the highlighted fields.",
  unknown: "Couldn't save your information. Please try again.",
};

const PASSWORD_RULES_ERROR = "Password doesn't meet the requirements yet.";

// onboarding: already signed in but info is missing, so the same screens
// prefilled with what's saved, no password, saved with saveOnboarding
export default function SignupForm({
  email,
  onboarding,
}: {
  email: string;
  onboarding?: OnboardingInput;
}) {
  const isOnboarding = onboarding !== undefined;

  // which screen we're on, so info from screen 1 stays when moving to screen 2
  const [step, setStep] = useState<"account" | "restaurant">("account");

  // screen 1: account info
  const [firstName, setFirstName] = useState(onboarding?.firstName ?? "");
  const [lastName, setLastName] = useState(onboarding?.lastName ?? "");
  const [phone, setPhone] = useState(onboarding?.phone ?? "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordFocused, setPasswordFocused] = useState(false);

  // screen 2: restaurant info
  const [restaurantName, setRestaurantName] = useState(
    onboarding?.restaurantName ?? "",
  );
  const [restaurantAddress, setRestaurantAddress] = useState(
    onboarding?.restaurantAddress ?? "",
  );
  const [cuisine, setCuisine] = useState(onboarding?.cuisine ?? "");

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

  // onboarding checks a screen's fields before moving on. returns true if they pass
  const checkFields = (fields: OnboardingField[]) => {
    if (!isOnboarding) return true;
    const errors = validateOnboarding(profile, fields);
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // a field's error clears as soon as they start fixing it
  const clearFieldError = (field: OnboardingField) =>
    setFieldErrors(errors => ({ ...errors, [field]: undefined }));

  const allRulesMet = meetsPasswordRules(password);
  const passwordsMatch = confirmPassword === password;

  // checklist opens when they click into the password box, and collapses once every rule passes
  const showChecklist =
    (passwordFocused || password.length > 0) && !allRulesMet;

  // screen 1 Continue: check the password, then move to the restaurant screen
  const handleContinue: ComponentProps<"form">["onSubmit"] = e => {
    e.preventDefault();
    setError(null);

    if (isOnboarding) {
      if (checkFields(accountFields)) setStep("restaurant");
      return;
    }

    if (!allRulesMet) {
      setError(PASSWORD_RULES_ERROR);
      return;
    }
    if (!passwordsMatch) {
      setError("Passwords don't match.");
      return;
    }

    setStep("restaurant");
  };

  // screen 2 Create Account: this is where the account actually gets made
  const handleCreateAccount: ComponentProps<"form">["onSubmit"] = async e => {
    e.preventDefault();
    setError(null);
    if (!checkFields(restaurantFields)) return;
    setIsLoading(true);

    try {
      if (isOnboarding) {
        // redirects by itself on success, so only failures come back
        const result = await saveOnboarding(profile);
        if (result?.error) {
          const serverFieldErrors = result.fieldErrors ?? {};
          setFieldErrors(serverFieldErrors);
          // send them back to the screen with the problem, everything still filled in
          if (accountFields.some(field => serverFieldErrors[field])) {
            setStep("account");
          }
          setError(onboardingErrors[result.error]);
          setIsLoading(false);
        }
        return;
      }

      const result = await signUpRestaurant({
        email,
        password,
        firstName,
        lastName,
        phone,
        restaurantName,
        restaurantAddress,
        cuisine,
      });

      // redirects by itself on success, so only failures come back
      if (result?.error) {
        const serverFieldErrors = result.fieldErrors ?? {};
        setFieldErrors(serverFieldErrors);
        // password and account fields live on screen 1, so send them back there with everything still filled in
        if (
          result.error === "weak_password" ||
          accountFields.some(field => serverFieldErrors[field])
        ) {
          setStep("account");
        }
        // field errors show under their boxes instead of a generic message
        setError(
          Object.keys(serverFieldErrors).length > 0
            ? null
            : signUpErrors[result.error],
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

  const errorMessage = error && <ErrorText role="alert">{error}</ErrorText>;

  if (step === "restaurant") {
    return (
      <AuthShell
        heading="Tell Us About Your Restaurant"
        footer={
          <LinkButton type="button" onClick={goBack} disabled={isLoading}>
            Go back
          </LinkButton>
        }
      >
        {/* onboarding's own field errors replace the browser's tooltips */}
        <Form onSubmit={handleCreateAccount} noValidate={isOnboarding}>
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

          <SubmitButton type="submit" disabled={isLoading}>
            {isOnboarding ? "Submit for Approval" : "Create Account"}
          </SubmitButton>
        </Form>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      heading={isOnboarding ? "Finish Your Account" : "Create Your Account"}
      footer={
        // onboarding is already signed in, so there's no other email to go back to
        isOnboarding ? (
          <form
            action={async () => {
              await signOut();
            }}
          >
            <LinkButton type="submit">Sign out</LinkButton>
          </form>
        ) : (
          <TextLink href="/login">Use a different email</TextLink>
        )
      }
    >
      <Form onSubmit={handleContinue} noValidate={isOnboarding}>
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

        {!isOnboarding && (
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
                <Checklist>
                  {passwordRules.map(rule => {
                    const met = rule.test(password);
                    return (
                      <CheckItem key={rule.label}>
                        <CheckIcon aria-hidden="true">
                          {met ? "✓" : "○"}
                        </CheckIcon>
                        {rule.label}
                        <SrOnly>{met ? "(met)" : "(not met)"}</SrOnly>
                      </CheckItem>
                    );
                  })}
                </Checklist>
              )}

              {allRulesMet && (
                <CheckLine>
                  <CheckIcon aria-hidden="true">✓</CheckIcon>
                  Password requirements met
                </CheckLine>
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
                  <CheckLine id="password-match" aria-live="polite">
                    <CheckIcon aria-hidden="true">
                      {passwordsMatch ? "✓" : "✕"}
                    </CheckIcon>
                    {passwordsMatch
                      ? "Passwords match"
                      : "Passwords don't match"}
                  </CheckLine>
                )}
              </>
            )}
          </>
        )}

        {errorMessage}

        <SubmitButton type="submit">Continue</SubmitButton>
      </Form>
    </AuthShell>
  );
}
