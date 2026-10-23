import { createClient, type SupabaseClient } from "@supabase/supabase-js";
// Public frontend configuration only. RLS and authenticated Edge Functions enforce access.
let client: SupabaseClient | undefined;
export function getSupabase() {
  // The sample mailbox must never initialize or refresh a real auth session.
  return (client ??= createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
      "https://bdeajozhylypiidrldka.supabase.co",
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      "sb_publishable_FX7QKUBZQmwykGcgv8SdfQ_lGRZF8n2",
  ));
}
export const attachmentBucket = "frankiflow-mail-attachments";
