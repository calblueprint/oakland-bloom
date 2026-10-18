"use client";

import { createBrowserClient as createBrowserClientSB } from "@supabase/ssr";
import { Database } from "@/types/database.types";

export function getSupabaseBrowserClient() {
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !supabaseKey) {
    throw new Error(
      "No Supabase environment variables detected, please make sure they are in place!",
    );
  }

  return createBrowserClientSB<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseKey,
  );
}
