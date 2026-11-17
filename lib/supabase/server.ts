"use server";

import type { Database } from "@/types/database.types";
import { cookies } from "next/headers";
import { createServerClient as createServerClientSB } from "@supabase/ssr";
import { getSupabaseEnv } from "./env";

export async function getSupabaseServerClient() {
  const { url, key } = getSupabaseEnv();

  const cookieStore = await cookies();

  return createServerClientSB<Database>(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          try {
            cookieStore.set(name, value, options);
          } catch {
            // Called from a Server Component, where cookies can't be set.
            // Safe to ignore: middleware refreshes the session.
          }
        });
      },
    },
  });
}
