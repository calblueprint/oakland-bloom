import assert from "node:assert/strict";
import { test } from "node:test";
import { getAccountStatus, homePathFor } from "../lib/auth/accountStatus.ts";
import {
  accountFields,
  cleanOnboardingInput,
  restaurantFields,
  validateOnboarding,
} from "../lib/auth/validation.ts";

const user = { name: "Jane Doe", phone: "5105550100", is_approved: false };
const restaurant = {
  name: "Bloom Bites",
  address: "1 Main St",
  cuisine: "Thai",
};

test("missing rows mean onboarding", () => {
  assert.equal(
    getAccountStatus({ user: null, restaurant: null }),
    "onboarding",
  );
  assert.equal(getAccountStatus({ user, restaurant: null }), "onboarding");
});

test("any blank field means onboarding, even if approved", () => {
  for (const record of [
    { user: { ...user, name: " " }, restaurant },
    { user: { ...user, phone: "" }, restaurant },
    // the signup trigger leaves these null when sign-up didn't send them
    { user, restaurant: { ...restaurant, cuisine: null } },
    {
      user: { ...user, is_approved: true },
      restaurant: { ...restaurant, name: null },
    },
  ]) {
    assert.equal(getAccountStatus(record), "onboarding");
  }
});

test("finished onboarding is pending until approved", () => {
  assert.equal(getAccountStatus({ user, restaurant }), "pending");
  assert.equal(
    getAccountStatus({ user: { ...user, is_approved: true }, restaurant }),
    "approved",
  );
});

test("each state has one home, and admins go to the admin page", () => {
  const homes = {
    onboarding: "/onboarding",
    pending: "/sign-up/pending",
    approved: "/",
  };
  for (const [status, path] of Object.entries(homes)) {
    assert.equal(homePathFor({ isAdmin: false, status }), path);
    assert.equal(homePathFor({ isAdmin: true, status }), "/admin/accounts");
  }
});

test("blank, oversized and malformed fields get readable errors", () => {
  const errors = validateOnboarding(
    cleanOnboardingInput({
      firstName: "  ",
      lastName: "x".repeat(201),
      phone: "Doe",
      restaurantName: "Bloom",
      restaurantAddress: "1 Main St",
      cuisine: "Thai",
    }),
  );
  assert.deepEqual(errors, {
    firstName: "Enter your first name.",
    lastName: "Keep your last name under 200 characters.",
    phone: "Enter a valid phone number, like (510) 555-0100.",
  });
});

test("each screen validates only its own fields", () => {
  const empty = cleanOnboardingInput({});
  assert.deepEqual(
    Object.keys(validateOnboarding(empty, accountFields)),
    accountFields,
  );
  assert.deepEqual(
    Object.keys(validateOnboarding(empty, restaurantFields)),
    restaurantFields,
  );
});

test("common phone formats pass", () => {
  for (const phone of ["(510) 555-0100", "510.555.0100", "+44 20 7946 0958"]) {
    assert.equal(
      validateOnboarding(cleanOnboardingInput({ phone }), ["phone"]).phone,
      undefined,
      phone,
    );
  }
});

test("non-string input from the network is treated as empty", () => {
  assert.deepEqual(cleanOnboardingInput({ firstName: 5, cuisine: [] }), {
    firstName: "",
    lastName: "",
    phone: "",
    restaurantName: "",
    restaurantAddress: "",
    cuisine: "",
  });
});
