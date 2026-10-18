"use server";

import { cookies } from "next/headers";
import { createServerClient as createServerClientSB } from "@supabase/ssr";
import { Database } from "@/types/database.types";

export async function getSupabaseServerClient<Schema = Database>() {
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !supabaseKey) {
    throw new Error(
      "No Supabase environment variables detected, please make sure they are in place!",
    );
  }

  const cookieStore = await cookies();

  return createServerClientSB<Schema>(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseKey,
    {
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
    },
  );
}
