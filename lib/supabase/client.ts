"use client";

import { createBrowserClient as createBrowserClientSB } from "@supabase/ssr";
import { Database } from "@/types/database.types";
import { getSupabaseEnv } from "./env";

export function getSupabaseBrowserClient() {
  const { url, key } = getSupabaseEnv();

  return createBrowserClientSB<Database>(url, key);
}
