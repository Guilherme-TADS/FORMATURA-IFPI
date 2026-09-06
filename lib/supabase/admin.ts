import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Elevated-privilege client using the secret key — bypasses RLS entirely.
 *
 * Only use this for operations that genuinely cannot go through a
 * SECURITY DEFINER RPC or the user's own session, e.g. Supabase Auth Admin
 * API calls (creating/deactivating users). Never import this into anything
 * that ships to the client.
 */
export function createAdminClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
