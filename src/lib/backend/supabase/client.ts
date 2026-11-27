import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { CONFIG } from './config.ts';

// Share the legacy singleton as well as surviving development module reloads.
const scope = globalThis as typeof globalThis & {
  __FRANKIFLOW_MAIL_SUPABASE__?: SupabaseClient;
};

export const supabase = scope.__FRANKIFLOW_MAIL_SUPABASE__ ?? createClient(
  CONFIG.supabaseUrl,
  CONFIG.supabasePublishableKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: typeof window === 'undefined' ? undefined : window.localStorage,
    },
  },
);

scope.__FRANKIFLOW_MAIL_SUPABASE__ = supabase;
