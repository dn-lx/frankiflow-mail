const BUCKET = "frankiflow-mail-attachments";
const MAX_FILE = 8 * 1024 * 1024;
const MAX_TOTAL = 18 * 1024 * 1024;
const allowedOrigins = new Set([
  "https://develop--frankiflow-mail.netlify.app",
  "https://mail.frankiflow.de",
  "https://v2--frankiflow-mail.netlify.app",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);
const cleanText = (value, max = 100000) => String(value ?? "").slice(0, max);
const cleanEmail = (value) => cleanText(value, 320).trim().toLowerCase();
const asArray = (value) => Array.isArray(value) ? value.map(String).map(v => v.trim()).filter(Boolean) : [];
class HttpError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
function checked(result) {
  if (result.error) throw new Error(result.error.message || "Mail storage request failed");
  return result.data;
}
export function decodeAttachments(input) {
  if (input == null) return [];
  if (!Array.isArray(input) || input.length > 14) throw new HttpError("Attach at most 14 files.");
  let total = 0;
  return input.map((item) => {
    const filename = cleanText(item?.filename, 180).trim();
    const content = typeof item?.content === "string" ? item.content.replace(/\s/g, "") : "";
    if (!filename || !content || content.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(content))
      throw new HttpError("An attachment has an invalid filename or base64 content.");
    if (content.length > Math.ceil(MAX_FILE / 3) * 4) throw new HttpError("Each attachment must be 8 MB or smaller.");
    let bytes;
    try { bytes = Uint8Array.from(atob(content), c => c.charCodeAt(0)); }
    catch { throw new HttpError("An attachment could not be decoded."); }
    total += bytes.length;
    if (bytes.length > MAX_FILE || total > MAX_TOTAL) throw new HttpError("Attachments must be 8 MB each and 18 MB combined or smaller.");
    const contentType = cleanText(item.contentType || "application/octet-stream", 120).replace(/[\r\n]/g, "");
    return { filename, content, contentType, ...(item.contentId ? { contentId: cleanText(item.contentId, 240) } : {}), bytes };
  });
}
async function archiveFiles(client, message, files, { repair = false } = {}) {
  const records = [];
  for (const file of files) {
    const id = file.archiveId || crypto.randomUUID();
    const record = { id, message_id: message.id, filename: file.filename, content_type: file.contentType,
      size_bytes: file.bytes.length, storage_path: file.archivePath || `${message.account_id}/${message.id}/${id}` };
    if (repair) checked(await client.from("frankiflow_mail_attachments").upsert(record, { onConflict: "id" }));
    else checked(await client.from("frankiflow_mail_attachments").insert(record));
    // The metadata row also authorizes authenticated cleanup if this upload fails.
    checked(await client.storage.from(BUCKET).upload(record.storage_path, file.bytes, { contentType: file.contentType, upsert: repair }));
    records.push(record);
  }
  return records;
}
async function deterministicId(value) {
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  hash[6] = (hash[6] & 15) | 80;
  hash[8] = (hash[8] & 63) | 128;
  const hex = Array.from(hash.slice(0, 16), n => n.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
async function downloadFile(url, fetchImpl) {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:") throw new Error("The provider returned an invalid attachment URL.");
  const response = await fetchImpl(url, { redirect: "error" });
  if (!response.ok || !response.body) throw new Error("The original attachment could not be downloaded.");
  const reader = response.body.getReader(), chunks = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > MAX_FILE) throw new Error("The original attachment exceeds 8 MB.");
      chunks.push(value);
    }
  } catch (error) { await reader.cancel().catch(() => {}); throw error; }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}
async function providerLookup(operation) {
  for (let attempt = 0; ; attempt++) {
    const result = await operation();
    if (attempt < 3 && (result.error?.statusCode === 429 || result.error?.name === "rate_limit_exceeded")) {
      await new Promise(resolve => setTimeout(resolve, 1100 * (attempt + 1)));
      continue;
    }
    return checked(result);
  }
}
export async function recoverAttachments(client, resend, message, fetchImpl = fetch) {
  if (message.direction !== "outbound") throw new HttpError("Only sent attachments can be recovered from the sending provider.");
  const emailId = message.resend_email_id || message.provider_message_id;
  if (!emailId) throw new HttpError("This message has no sending-provider reference.");
  const files = [];
  const existing = checked(await client.from("frankiflow_mail_attachments").select("id,filename,size_bytes,storage_path").eq("message_id", message.id)) || [];
  const reused = new Set();
  let after;
  let total = 0;
  do {
    const page = await providerLookup(() => resend.emails.attachments.list({ emailId, limit: 100, ...(after ? { after } : {}) }));
    for (const item of page?.data || []) {
      if (files.length >= 14) throw new Error("The provider returned more than 14 attachments.");
      const attachment = await providerLookup(() => resend.emails.attachments.get({ emailId, id: item.id }));
      const bytes = await downloadFile(attachment.download_url, fetchImpl);
      if (Number.isFinite(attachment.size) && bytes.length !== attachment.size) throw new Error("The recovered attachment size does not match the provider's original.");
      total += bytes.length;
      if (total > MAX_TOTAL) throw new Error("Recovered attachments exceed 18 MB combined.");
      const filename = cleanText(attachment.filename || item.filename || "Attachment", 180);
      let match;
      for (const candidate of existing) {
        if (reused.has(candidate.id) || candidate.filename !== filename || Number(candidate.size_bytes) !== bytes.length) continue;
        const stored = await client.storage.from(BUCKET).download(candidate.storage_path);
        if (stored.error || !stored.data) continue;
        const original = new Uint8Array(await stored.data.arrayBuffer());
        if (original.length === bytes.length && original.every((value, index) => value === bytes[index])) { match = candidate; reused.add(candidate.id); break; }
      }
      files.push({ filename, contentType: cleanText(attachment.content_type || "application/octet-stream", 120), bytes,
        archiveId: match?.id || await deterministicId(`${message.id}:${item.id}`), archivePath: match?.storage_path });
    }
    const next = page?.has_more ? page.data.at(-1)?.id : undefined;
    if (page?.has_more && (!next || next === after)) throw new Error("The provider attachment listing could not be completed.");
    after = next;
  } while (after);
  if (!files.length) throw new HttpError("The provider no longer has attachments for this message. Keep the original file; do not resend the email.", 404);
  const records = await archiveFiles(client, message, files, { repair: true });
  checked(await client.from("frankiflow_mail_messages").update({ has_attachments: true }).eq("id", message.id));
  return { ok: true, recovered: records.length, mail_message_id: message.id, files: await Promise.all(files.map(async file => ({
    filename: file.filename, size_bytes: file.bytes.length,
    sha256: Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", file.bytes)), n => n.toString(16).padStart(2, "0")).join(""),
  }))) };
}
export function createHandler({ createClient, Resend, env, fetchImpl = fetch, logger = console }) {
  return async (req) => {
    const origin = req.headers.get("Origin");
    const cors = { "Access-Control-Allow-Origin": allowedOrigins.has(origin) ? origin : "https://develop--frankiflow-mail.netlify.app",
      Vary: "Origin", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
    const json = (data, status = 200) => Response.json(data, { status, headers: cors });
    if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
    let staged, client, delivered = false, deliveryAttempted = false;
    let providerId, replyMessageId = "", scheduledAt;
    try {
      const authorization = req.headers.get("Authorization");
      if (!authorization) return json({ error: "Unauthorized" }, 401);
      let body;
      try { body = await req.json(); } catch { throw new HttpError("Invalid request JSON."); }
      if (!body || typeof body !== "object" || Array.isArray(body)) throw new HttpError("Invalid request body.");
      const serviceRole = env("SUPABASE_SERVICE_ROLE_KEY");
      const bearer = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
      let adminRepair = body.action === "repair-attachments" && serviceRole && bearer === serviceRole;
      if (body.action === "repair-attachments" && !adminRepair) {
        // Valid service JWTs can differ from the runtime's default JWT (for example after rotation).
        // A decoded role is only a hint: the Auth admin endpoint must verify the credential.
        let role;
        try { role = JSON.parse(atob(bearer.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).role; } catch {}
        if (role === "service_role") {
          const probe = await fetchImpl(`${env("SUPABASE_URL")}/auth/v1/admin/users?page=1&per_page=1`, {
            headers: { apikey: env("SUPABASE_ANON_KEY"), Authorization: authorization },
          });
          adminRepair = probe.ok;
          await probe.body?.cancel();
        }
      }
      client = createClient(env("SUPABASE_URL"), adminRepair ? bearer : env("SUPABASE_ANON_KEY"), {
        global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false },
      });
      let user;
      if (!adminRepair) {
        const result = await client.auth.getUser();
        user = result.data?.user;
        if (result.error || !user) return json({ error: "Unauthorized" }, 401);
        const access = checked(await client.from("frankiflow_mail_users").select("user_id").eq("user_id", user.id).eq("active", true).maybeSingle());
        if (!access) return json({ error: "Mailbox access denied" }, 403);
      }
      if (body.action === "repair-attachments") {
        if (typeof body.message_id !== "string" || !/^[0-9a-f-]{36}$/i.test(body.message_id)) throw new HttpError("A valid internal message ID is required.");
        // User calls read through RLS first; administrative calls already authenticate with the service key.
        const message = checked(await client.from("frankiflow_mail_messages").select("id,account_id,direction,provider_message_id,resend_email_id").eq("id", body.message_id).maybeSingle());
        if (!message) throw new HttpError("Message not found or access denied.", 404);
        if (!serviceRole) throw new HttpError("Attachment recovery is not configured.", 503);
        const admin = adminRepair ? client : createClient(env("SUPABASE_URL"), serviceRole, { auth: { persistSession: false, autoRefreshToken: false } });
        const apiKey = env("RESEND_API_KEY");
        if (!apiKey) throw new HttpError("Mail provider is not configured.", 503);
        return json(await recoverAttachments(admin, new Resend(apiKey), message, fetchImpl));
      }
      if (body.action) throw new HttpError("Unknown mail action.");
      const to = asArray(body.to), cc = asArray(body.cc), bcc = asArray(body.bcc);
      const subject = cleanText(body.subject, 998) || "(no subject)", text = cleanText(body.text);
      const html = cleanText(body.html, 900000) || undefined;
      scheduledAt = body.scheduledAt ? new Date(String(body.scheduledAt)) : null;
      if (!to.length) throw new HttpError("Recipient required");
      if (scheduledAt && Number.isNaN(scheduledAt.getTime())) throw new HttpError("Invalid schedule time");
      if (scheduledAt && scheduledAt.getTime() < Date.now() + 60000) throw new HttpError("Scheduled time must be at least one minute in the future");
      const attachments = decodeAttachments(body.attachments);
      let account;
      const fromAddress = cleanEmail(body.fromAddress);
      if (fromAddress) {
        account = checked(await client.from("frankiflow_mail_accounts").select("id,address,display_name,is_primary").eq("address", fromAddress).maybeSingle());
        if (!account) throw new HttpError("The requested sender account is not available.", 403);
      }
      if (!account && body.thread_id) {
        const latest = checked(await client.from("frankiflow_mail_messages").select("account_id").eq("thread_id", body.thread_id).order("created_at", { ascending: false }).limit(1).maybeSingle());
        if (latest?.account_id) account = checked(await client.from("frankiflow_mail_accounts").select("id,address,display_name,is_primary").eq("id", latest.account_id).maybeSingle());
      }
      if (!account) {
        const defaults = checked(await client.from("frankiflow_mail_user_accounts").select("account_id,is_default,can_send").eq("user_id", user.id).eq("can_send", true).order("is_default", { ascending: false }).limit(1));
        if (defaults?.[0]) account = checked(await client.from("frankiflow_mail_accounts").select("id,address,display_name,is_primary").eq("id", defaults[0].account_id).maybeSingle());
      }
      if (!account) throw new HttpError("No sender account is assigned to this user", 403);
      if (!checked(await client.rpc("frankiflow_mail_can_send_from_account", { p_account_id: account.id }))) throw new HttpError("Sending from this account is not permitted.", 403);
      const apiKey = env("RESEND_API_KEY");
      if (!apiKey) throw new HttpError("RESEND_API_KEY is not configured yet", 503);
      const resend = new Resend(apiKey);
      replyMessageId = cleanText(body.in_reply_to, 500).trim();
      if (replyMessageId && !(replyMessageId.startsWith("<") && replyMessageId.endsWith(">"))) {
        // Two exact filters avoid treating a provider ID as PostgREST filter syntax.
        let parent = checked(await client.from("frankiflow_mail_messages").select("internet_message_id").eq("provider_message_id", replyMessageId).maybeSingle());
        if (!parent) parent = checked(await client.from("frankiflow_mail_messages").select("internet_message_id").eq("resend_email_id", replyMessageId).maybeSingle());
        replyMessageId = parent?.internet_message_id || "";
      }
      const now = new Date().toISOString();
      const threadId = body.thread_id || crypto.randomUUID();
      if (!body.thread_id) checked(await client.from("frankiflow_mail_threads").insert({ id: threadId, subject, last_message_at: now, message_count: 1 }));
      const id = crypto.randomUUID();
      // Stage a recoverable draft and its files BEFORE invoking the delivery provider.
      const row = { id, thread_id: threadId, account_id: account.id, direction: "outbound", folder: "drafts",
        from_address: cleanEmail(account.address), from_name: account.display_name || "FrankiFlow", to_addresses: to, cc_addresses: cc, bcc_addresses: bcc,
        reply_to: cleanEmail(account.address), subject, text_body: text, html_body: html || null,
        in_reply_to: replyMessageId || null, references_header: replyMessageId || null,
        preview: text.replace(/\s+/g, " ").slice(0, 180), is_read: true, has_attachments: attachments.length > 0 };
      checked(await client.from("frankiflow_mail_messages").insert(row));
      staged = row;
      await archiveFiles(client, row, attachments);
      const headers = replyMessageId ? { "In-Reply-To": replyMessageId, References: replyMessageId } : undefined;
      deliveryAttempted = true;
      const sendResult = await resend.emails.send({ from: `${row.from_name} <${row.from_address}>`, to,
        cc: cc.length ? cc : undefined, bcc: bcc.length ? bcc : undefined, replyTo: row.from_address, subject,
        text: text || (html ? undefined : " "), html, scheduledAt: scheduledAt?.toISOString(),
        attachments: attachments.length ? attachments.map(({ bytes, ...file }) => file) : undefined, headers,
        tags: [{ name: "app", value: "frankiflow-mail" }, { name: "environment", value: origin === "https://mail.frankiflow.de" ? "production" : origin === "https://v2--frankiflow-mail.netlify.app" ? "v2" : "develop" }],
      }, { idempotencyKey: `frankiflow-mail:${id}` });
      if (sendResult.error) {
        const status = sendResult.error.statusCode;
        // Transport errors and 5xx responses can arrive after provider acceptance.
        // Only a definite client-side rejection is safe to clean up.
        deliveryAttempted = !(status >= 400 && status < 500 && status !== 408 && status !== 409);
        checked(sendResult);
      }
      const sent = sendResult.data;
      if (!sent?.id) throw new Error("Resend did not return a delivery reference.");
      providerId = sent.id;
      delivered = true;
      // Persist the provider reference before optional RFC Message-ID/thread bookkeeping.
      checked(await client.from("frankiflow_mail_messages").update({ provider_message_id: sent.id, resend_email_id: sent.id,
        folder: scheduledAt ? "scheduled" : "sent", sent_at: scheduledAt ? null : now, scheduled_at: scheduledAt?.toISOString() || null, updated_at: now }).eq("id", id).select("id").single());
      let internetMessageId = null;
      if (!scheduledAt) {
        try {
          const details = checked(await resend.emails.get(sent.id));
          internetMessageId = details?.message_id || null;
          if (internetMessageId) checked(await client.from("frankiflow_mail_messages").update({ internet_message_id: internetMessageId }).eq("id", id));
        } catch { logger.warn("Could not persist the RFC Message-ID after delivery."); }
      }
      if (body.thread_id) {
        try {
          const threadRow = checked(await client.from("frankiflow_mail_threads").select("message_count").eq("id", threadId).maybeSingle());
          if (threadRow) checked(await client.from("frankiflow_mail_threads").update({ last_message_at: scheduledAt?.toISOString() || now, message_count: Math.max(1, Number(threadRow.message_count || 0) + 1) }).eq("id", threadId));
        } catch { logger.warn("Thread counters could not be updated after delivery."); }
      }
      return json({ ok: true, id: sent.id, thread_id: threadId, from: row.from_address, message_id: internetMessageId,
        mail_message_id: id, scheduled_at: scheduledAt?.toISOString() || null, attachments_archived: attachments.length });
    } catch (error) {
      logger.error("Mail operation failed:", error instanceof Error ? error.message : "Unexpected error");
      if (delivered) return json({ ok: true, id: providerId, mail_message_id: staged?.id, thread_id: staged?.thread_id,
        warning: "Email accepted by the provider, but its Sent status could not be updated. Its files are saved in Drafts. Do not resend the email.", scheduled_at: scheduledAt?.toISOString() || null });
      if (deliveryAttempted && staged) return json({ error: "Delivery could not be confirmed. A draft with the original files has been kept. Check delivery with your administrator before retrying; do not resend automatically.", mail_message_id: staged.id, delivery_unconfirmed: true }, 502);
      if (staged && client) {
        // Remove only this request's unsent staged copy. Original user drafts remain intact.
        try {
          const files = checked(await client.from("frankiflow_mail_attachments").select("storage_path").eq("message_id", staged.id));
          if (files?.length) checked(await client.storage.from(BUCKET).remove(files.map(file => file.storage_path)));
          checked(await client.from("frankiflow_mail_messages").delete().eq("id", staged.id).eq("folder", "drafts"));
        } catch { logger.warn("An unsent staged copy could not be cleaned up."); }
      }
      return json({ error: error instanceof Error ? error.message : "Unexpected error" }, error instanceof HttpError ? error.status : 500);
    }
  };
}
