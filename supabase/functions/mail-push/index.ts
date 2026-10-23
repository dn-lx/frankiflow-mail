import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.116.0";
import { sendPushBatch } from "npm:@mmmike/web-push@1.3.0/send";

const ALLOWED_ORIGINS = new Set([
  "https://develop--frankiflow-mail.netlify.app",
  "https://main--frankiflow-mail.netlify.app",
  "https://mail.frankiflow.de",
  "https://v2--frankiflow-mail.netlify.app",
  "https://v2--frankiholz.netlify.app",
  "https://develop--frankiflow-mail.netlify.app",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);

function cors(req: Request) {
  const origin = req.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : "https://mail.frankiflow.de",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(req), "Content-Type": "application/json" },
  });
}

function validPushHost(endpoint: string) {
  try {
    const url = new URL(endpoint);
    if (url.protocol !== "https:") return false;
    const host = url.hostname.toLowerCase();
    return host === "fcm.googleapis.com"
      || host.endsWith(".push.services.mozilla.com")
      || host.endsWith(".push.apple.com");
  } catch {
    return false;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authHeader = req.headers.get("Authorization") || "";
  if (!supabaseUrl || !serviceRole || !authHeader.startsWith("Bearer ")) {
    return json(req, { error: "Unauthorized" }, 401);
  }

  const token = authHeader.slice(7);
  const admin = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: authData, error: authError } = await admin.auth.getUser(token);
  const user = authData?.user;
  if (authError || !user) return json(req, { error: "Unauthorized" }, 401);

  const { data: mailUser } = await admin
    .from("frankiflow_mail_users")
    .select("user_id,active")
    .eq("user_id", user.id)
    .eq("active", true)
    .maybeSingle();
  if (!mailUser) return json(req, { error: "Mail access is not enabled" }, 403);

  let body: any = {};
  try { body = await req.json(); } catch { body = {}; }
  const action = String(body.action || "status");

  const publicKey = Deno.env.get("WEB_PUSH_VAPID_PUBLIC_KEY") || "";
  const privateKey = Deno.env.get("WEB_PUSH_VAPID_PRIVATE_KEY") || "";
  const subject = Deno.env.get("WEB_PUSH_VAPID_SUBJECT") || "mailto:info@frankiflow.de";
  const configured = Boolean(publicKey && privateKey && subject);

  if (action === "config") {
    const { count } = await admin
      .from("frankiflow_mail_push_subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("enabled", true);
    return json(req, { configured, publicKey: publicKey || null, subscriptionCount: count || 0 });
  }

  if (action === "subscribe") {
    if (!publicKey) return json(req, { error: "Web Push is not configured yet" }, 503);
    const subscription = body.subscription || {};
    const endpoint = String(subscription.endpoint || "").trim();
    const p256dh = String(subscription.keys?.p256dh || "").trim();
    const auth = String(subscription.keys?.auth || "").trim();
    if (!endpoint || !p256dh || !auth || !validPushHost(endpoint)) {
      return json(req, { error: "Invalid browser push subscription" }, 400);
    }
    const row = {
      user_id: user.id,
      endpoint,
      p256dh,
      auth,
      user_agent: String(body.userAgent || req.headers.get("user-agent") || "").slice(0, 500),
      device_name: String(body.deviceName || "Browser device").slice(0, 120),
      enabled: true,
      updated_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
    };
    const { error } = await admin
      .from("frankiflow_mail_push_subscriptions")
      .upsert(row, { onConflict: "endpoint" });
    if (error) return json(req, { error: error.message }, 500);
    return json(req, { ok: true });
  }

  if (action === "unsubscribe") {
    const endpoint = String(body.endpoint || "").trim();
    if (endpoint) {
      await admin.from("frankiflow_mail_push_subscriptions").delete().eq("user_id", user.id).eq("endpoint", endpoint);
    }
    return json(req, { ok: true });
  }

  if (action === "test") {
    if (!configured) return json(req, { error: "Web Push VAPID secrets are not configured" }, 503);
    const { data: rows, error } = await admin
      .from("frankiflow_mail_push_subscriptions")
      .select("endpoint,p256dh,auth")
      .eq("user_id", user.id)
      .eq("enabled", true);
    if (error) return json(req, { error: error.message }, 500);
    if (!rows?.length) return json(req, { error: "No push-enabled device is registered" }, 400);

    const subscriptions = rows.map((r: any) => ({ endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } }));
    const result = await sendPushBatch(
      subscriptions,
      { title: "FrankiFlow Mail", body: "Push notifications are working on this device.", url: "/", tag: "ffmail-push-test" },
      { publicKey, privateKey, subject },
      { ttl: 60, urgency: "high", concurrency: 10 },
    );
    if (result.gone?.length) {
      await admin.from("frankiflow_mail_push_subscriptions").delete().in("endpoint", result.gone);
    }
    return json(req, { ok: true, delivered: result.delivered || 0, gone: result.gone?.length || 0, failed: result.failed?.length || 0 });
  }

  return json(req, { error: "Unknown action" }, 400);
});