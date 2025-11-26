// Supabase client factory added to centralise auth and database access for the new pages.
import { createBrowserClient } from "@supabase/ssr";

export const createSupabaseBrowserClient = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Supabase environment variables are not configured. Ensure SUPABASE_URL and SUPABASE_ANON are set on the server; these are mapped to NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY during the Docker build."
    );
  }

  return createBrowserClient(supabaseUrl, supabaseAnonKey);
};
