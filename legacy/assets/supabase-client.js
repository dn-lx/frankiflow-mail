import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.116.0';
import { CONFIG } from './config.js';

const KEY='__FRANKIFLOW_MAIL_SUPABASE__';
const existing=globalThis[KEY];
export const supabase=existing||createClient(CONFIG.supabaseUrl,CONFIG.supabasePublishableKey,{
  auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}
});
if(!existing)globalThis[KEY]=supabase;
