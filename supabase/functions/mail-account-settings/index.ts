import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.116.0";

const allowedOrigins = new Set([
  "https://mail-frankiflow.shipstatic.com",
  "https://mail.frankiflow.de",
  "https://v2--frankiflow-mail.netlify.app",
  "https://v2--frankiholz.netlify.app",
  "https://develop--frankiflow-mail.netlify.app",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);
function corsFor(origin: string | null) {
  const allow = origin && allowedOrigins.has(origin) ? origin : "https://mail-frankiflow.shipstatic.com";
  return {
    "Access-Control-Allow-Origin": allow,
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}
const clean = (v: unknown, n = 80) => String(v ?? "").trim().slice(0, n);

Deno.serve(async (req: Request) => {
  const cors = corsFor(req.headers.get("Origin"));
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405, headers: cors });
  try {
    const authorization = req.headers.get("Authorization");
    if (!authorization) return Response.json({ error: "Unauthorized" }, { status: 401, headers: cors });
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return Response.json({ error: "Unauthorized" }, { status: 401, headers: cors });
    const { data: access } = await userClient.from("frankiflow_mail_users").select("user_id").eq("user_id", user.id).eq("active", true).maybeSingle();
    if (!access) return Response.json({ error: "Mailbox access denied" }, { status: 403, headers: cors });

    const { data: visible, error: visibleError } = await userClient
      .from("frankiflow_mail_accounts")
      .select("id,address,display_name,is_primary,created_at")
      .order("is_primary", { ascending: false });
    if (visibleError) throw visibleError;
    const visibleAddresses = new Set((visible || []).map((a: any) => String(a.address).toLowerCase()));

    const body = await req.json();
    const requested = Array.isArray(body?.accounts) ? body.accounts : [];
    const admin = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } });
    for (const row of requested.slice(0, 12)) {
      const address = clean(row?.address, 320).toLowerCase();
      const displayName = clean(row?.display_name, 80);
      if (!visibleAddresses.has(address) || !displayName) continue;
      const target = (visible || []).find((account: any) => String(account.address).toLowerCase() === address);
      const permission = await userClient.rpc("frankiflow_mail_can_send_from_account", { p_account_id: target?.id });
      if (permission.error || !permission.data) return Response.json({ error: "Sender settings access denied" }, { status: 403, headers: cors });
      const { error } = await admin.from("frankiflow_mail_accounts").update({ display_name: displayName }).eq("address", address);
      if (error) throw error;
    }

    const { data: accounts, error: readError } = await userClient
      .from("frankiflow_mail_accounts")
      .select("id,address,display_name,is_primary,created_at")
      .order("is_primary", { ascending: false });
    if (readError) throw readError;
    return Response.json({ ok: true, accounts }, { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (error) {
    console.error(error);
    return Response.json({ error: error instanceof Error ? error.message : "Unexpected error" }, { status: 500, headers: cors });
  }
});
