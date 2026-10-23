const origins = new Set(["https://v2--frankiflow-mail.netlify.app",
  "https://v2--frankiholz.netlify.app", "https://develop--frankiflow-mail.netlify.app", "https://mail.frankiflow.de", "http://localhost:3000", "http://127.0.0.1:3000"]);
export function createHandler({ createClient, Resend, env }) {
  return async request => {
    const origin = request.headers.get("Origin");
    const headers = { "Access-Control-Allow-Origin": origins.has(origin) ? origin : "https://v2--frankiflow-mail.netlify.app", Vary: "Origin", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS" };
    const json = (body, status = 200) => Response.json(body, { status, headers });
    if (request.method === "OPTIONS") return new Response("ok", { headers });
    if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
    let canceled = false;
    try {
      const authorization = request.headers.get("Authorization");
      if (!authorization) return json({ error: "Unauthorized" }, 401);
      const client = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } });
      const checked = result => { if (result.error) throw new Error(result.error.message); return result.data; };
      const { data, error } = await client.auth.getUser();
      if (error || !data?.user) return json({ error: "Unauthorized" }, 401);
      if (!checked(await client.from("frankiflow_mail_users").select("user_id").eq("user_id", data.user.id).eq("active", true).maybeSingle())) return json({ error: "Mailbox access denied" }, 403);
      const body = await request.json();
      if (body.action !== "cancel-scheduled" || !/^[a-f0-9-]{36}$/i.test(body.message_id || "")) return json({ error: "A supported action and internal message ID are required." }, 400);
      const message = checked(await client.from("frankiflow_mail_messages").select("id,account_id,folder,direction,resend_email_id,provider_message_id").eq("id", body.message_id).maybeSingle());
      if (!message) return json({ error: "Message not found" }, 404);
      if (message.folder !== "scheduled" || message.direction !== "outbound") return json({ error: "Only scheduled outbound messages can be canceled." }, 400);
      if (!checked(await client.rpc("frankiflow_mail_can_send_from_account", { p_account_id: message.account_id }))) return json({ error: "Sending from this account is not permitted." }, 403);
      const apiKey = env("RESEND_API_KEY");
      if (!apiKey) return json({ error: "Mail provider is not configured." }, 503);
      const resend = new Resend(apiKey), id = message.resend_email_id || message.provider_message_id;
      if (!id) return json({ error: "The schedule has no provider reference." }, 409);
      const result = await resend.emails.cancel(id);
      if (result.error) {
        const existing = await resend.emails.get(id);
        if (!["canceled", "cancelled"].includes(existing.data?.last_event)) throw new Error(result.error.message || "The provider could not cancel this schedule. It may already have been delivered.");
      }
      canceled = true;
      checked(await client.from("frankiflow_mail_messages").update({ folder: "drafts", direction: "draft", scheduled_at: null, sent_at: null, provider_message_id: null, resend_email_id: null, internet_message_id: null, updated_at: new Date().toISOString() }).eq("id", message.id).eq("folder", "scheduled").select("id").single());
      return json({ ok: true, mail_message_id: message.id });
    } catch (error) {
      if (canceled) return json({ ok: true, warning: "The provider canceled delivery, but the mailbox status could not be updated. Refresh before editing this message." });
      return json({ error: error instanceof Error ? error.message : "The request failed." }, 500);
    }
  };
}
