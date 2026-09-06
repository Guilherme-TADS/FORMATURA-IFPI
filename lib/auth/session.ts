import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];

const PROFILE_HEADER = "x-profile";

// Every admin page calls this in addition to app/admin/layout.tsx calling it
// once already — cache() memoizes this per request so they share one result
// instead of fetching it twice within the same render.
//
// On /admin routes, proxy.ts (middleware) already ran auth.getUser() plus a
// profile select to gate the request, and forwards that verified profile via
// the x-profile request header — proxy.ts is the only place that ever sets
// it, always overwriting any client-supplied copy, so it's safe to trust
// here. That lets this function skip two more sequential Supabase round
// trips on every admin navigation. Routes middleware doesn't gate (the
// public site) never carry this header, so they fall through to the real
// fetch below exactly as before.
export const getCurrentProfile = cache(async (): Promise<Profile | null> => {
  const forwarded = (await headers()).get(PROFILE_HEADER);
  if (forwarded) {
    try {
      return JSON.parse(forwarded) as Profile;
    } catch {
      // Malformed somehow — fall through to the real fetch rather than fail.
    }
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  return profile;
});
