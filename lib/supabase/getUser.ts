import { cache } from "react";
import { getSupabaseServerClient } from "./server";

export const getCurrentUser = cache(async () => {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});
